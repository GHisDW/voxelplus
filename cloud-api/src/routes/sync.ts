import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getUserSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';

export const syncRouter = new Hono<CloudApiEnv>();

syncRouter.post('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const body = await c.req.json();

  const userSupabase = getUserSupabaseClient(token);
  if (!userSupabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }

  const now = new Date().toISOString();

  const syncPayload = {
    ...body,
    lastSyncedAt: now,
    status: 'Synced'
  };

  const { error } = await userSupabase
    .from('voxel_cloud_sync')
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
