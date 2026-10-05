import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getUserSupabaseClient, getAdminSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';
import { evaluateAchievements } from '../achievementEngine.js';

export const libraryRouter = new Hono<CloudApiEnv>();

libraryRouter.get('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const userSupabase = getUserSupabaseClient(token);

  if (!userSupabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }

  const { data, error } = await userSupabase
    .from('voxel_library')
    .select('*')
    .eq('user_id', authUser.id);

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  const items = (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    source: row.source,
    addedAt: row.added_at,
    metadata: row.metadata || {}
  }));

  return c.json(items);
});

libraryRouter.post('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { id, title, type, source, metadata } = body;

  if (!title || !type) {
    return c.json({ error: 'Title and type are required.' }, 400);
  }

  const userSupabase = getUserSupabaseClient(token);
  if (!userSupabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }
  const now = new Date().toISOString();

  const { data, error } = await userSupabase
    .from('voxel_library')
    .upsert({
      id: id || undefined,
      user_id: authUser.id,
      title,
      type,
      source: source || 'Voxel+',
      added_at: now,
      metadata: metadata || {}
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  // Library state changed — re-evaluate server-derived achievements.
  const adminSupabase = getAdminSupabaseClient();
  if (adminSupabase) await evaluateAchievements(adminSupabase, authUser.id);

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'library.item_add',
    resource: 'voxel_library',
    details: { itemId: data.id, type: data.type, title: data.title }
  });

  return c.json({
    id: data.id,
    title: data.title,
    type: data.type,
    source: data.source,
    addedAt: data.added_at,
    metadata: data.metadata || {}
  });
});
