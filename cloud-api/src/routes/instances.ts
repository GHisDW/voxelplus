import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getDataStore } from '../store.js';
import { evaluateAchievements } from '../achievementEngine.js';
import { logAuditEventServer } from '../audit.js';

export const instancesRouter = new Hono<CloudApiEnv>();

/**
 * GET /api/instances — the caller's server-known instances.
 */
instancesRouter.get('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const admin = getDataStore();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { data, error } = await admin
    .table('voxel_instances')
    .select('id, name, version, mods_count, resourcepacks_count, shaders_count, created_at')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false });
  if (error) return c.json({ error: 'Instances unavailable.' }, 503);
  return c.json(data || []);
});

/**
 * POST /api/instances — persist a created instance server-side.
 * Increments the authoritative lifetime counter so delete/recreate churn
 * cannot farm instance achievements.
 */
instancesRouter.post('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json().catch(() => ({}));
  const { name, version, modsCount, resourcepacksCount, shadersCount } = body;
  if (!name || typeof name !== 'string') return c.json({ error: 'name is required.' }, 400);

  const admin = getDataStore();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { data: row, error } = await admin
    .table('voxel_instances')
    .insert({
      user_id: authUser.id,
      name: String(name).slice(0, 128),
      version: String(version || '').slice(0, 64),
      mods_count: Number.isInteger(modsCount) ? modsCount : 0,
      resourcepacks_count: Number.isInteger(resourcepacksCount) ? resourcepacksCount : 0,
      shaders_count: Number.isInteger(shadersCount) ? shadersCount : 0
    })
    .select('id')
    .single();
  if (error) return c.json({ error: 'Instance could not be recorded.' }, 503);

  // Lifetime counter — monotonically increasing, never decremented.
  const { data: profile } = await admin
    .table('voxel_users')
    .select('instances_created_total')
    .eq('id', authUser.id)
    .maybeSingle();
  await admin
    .table('voxel_users')
    .update({ instances_created_total: (profile?.instances_created_total ?? 0) + 1 })
    .eq('id', authUser.id);

  await evaluateAchievements(admin, authUser.id);
  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'instance.created',
    resource: 'voxel_instances',
    details: { instance_id: row?.id }
  });

  return c.json({ id: row?.id });
});

/**
 * DELETE /api/instances/:id — remove the instance record.
 * The lifetime counter is intentionally untouched.
 */
instancesRouter.delete('/:id', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const id = c.req.param('id');
  const admin = getDataStore();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { error } = await admin
    .table('voxel_instances')
    .delete()
    .eq('id', id)
    .eq('user_id', authUser.id);
  if (error) return c.json({ error: 'Instance could not be deleted.' }, 503);
  return c.json({ success: true });
});
