import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getDataStore } from '../store.js';
import { logAuditEventServer } from '../audit.js';

export const syncRouter = new Hono<CloudApiEnv>();

// Maximum payload size limit: 500 KB
const MAX_SYNC_PAYLOAD_BYTES = 500 * 1024;

syncRouter.get('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');

  const db = getDataStore();
  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  const { data, error } = await (db as any)
    .table('voxel_cloud_sync')
    .select('sync_payload, last_synced_at')
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  return c.json(data?.sync_payload || null);
});

syncRouter.post('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json();

  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SYNC_PAYLOAD_BYTES) {
    return c.json({
      error: 'Cloud sync payload exceeds maximum size limit of 500 KB. Worlds and raw binary files cannot be uploaded.',
      code: 'PAYLOAD_TOO_LARGE'
    }, 413);
  }

  const db = getDataStore();
  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  const now = new Date().toISOString();

  const syncPayload = {
    ...body,
    lastSyncedAt: now,
    status: 'Synced'
  };

  const { error } = await (db as any)
    .table('voxel_cloud_sync')
    .upsert({
      user_id: authUser.id,
      sync_payload: syncPayload,
      last_synced_at: now
    }, { onConflict: 'user_id' });

  if (error) {
    return c.json({ error: error.message, status: 'Sync Failed' }, 400);
  }

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'data.sync',
    resource: 'voxel_cloud_sync',
    details: { lastSyncedAt: now }
  });

  return c.json(syncPayload);
});
