import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getAdminSupabaseClient } from '../supabase.js';
import { evaluateAchievements } from '../achievementEngine.js';
import { logAuditEventServer } from '../audit.js';

export const vpacksRouter = new Hono<CloudApiEnv>();

/**
 * GET /api/vpacks/catalog — the Shop's VPack catalog.
 */
vpacksRouter.get('/catalog', async (c) => {
  const admin = getAdminSupabaseClient();
  if (!admin) return c.json({ error: 'Catalog unavailable.' }, 503);
  const { data, error } = await admin
    .from('voxel_vpack_catalog')
    .select('id, name, description, icon, contents')
    .eq('enabled', true);
  if (error) return c.json({ error: 'Catalog unavailable.' }, 503);
  return c.json(data || []);
});

/**
 * GET /api/vpacks — VPacks in the caller's library.
 */
vpacksRouter.get('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const admin = getAdminSupabaseClient();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { data, error } = await admin
    .from('voxel_library')
    .select('id, title, metadata, created_at')
    .eq('user_id', authUser.id)
    .eq('type', 'vpack')
    .order('created_at', { ascending: false });
  if (error) return c.json({ error: 'VPacks unavailable.' }, 503);
  return c.json(data || []);
});

/**
 * POST /api/vpacks — create a VPack (origin 'created').
 * Body: { title, description?, contents? }
 */
vpacksRouter.post('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json().catch(() => ({}));
  const { title, description, contents } = body;
  if (!title || typeof title !== 'string') return c.json({ error: 'title is required.' }, 400);

  const admin = getAdminSupabaseClient();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { data, error } = await admin
    .from('voxel_library')
    .insert({
      user_id: authUser.id,
      title: String(title).slice(0, 200),
      type: 'vpack',
      source: 'voxelplus',
      metadata: { origin: 'created', description: description || '', contents: contents || {}, installed: false }
    })
    .select('id')
    .single();
  if (error) return c.json({ error: 'VPack could not be created.' }, 503);

  await evaluateAchievements(admin, authUser.id);
  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'vpack.created',
    resource: 'voxel_library',
    details: { vpack_id: data?.id }
  });
  return c.json({ id: data?.id });
});

/**
 * POST /api/vpacks/convert — convert a server-known instance into a VPack.
 * Body: { instanceId, title?, description? }
 * The conversion origin is authoritative: it requires a real voxel_instances
 * row owned by the caller — client metadata alone cannot fake a conversion.
 */
vpacksRouter.post('/convert', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json().catch(() => ({}));
  const { instanceId, title, description } = body;
  if (!instanceId) return c.json({ error: 'instanceId is required.' }, 400);

  const admin = getAdminSupabaseClient();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { data: instance, error: instErr } = await admin
    .from('voxel_instances')
    .select('id, name, version, mods_count, resourcepacks_count, shaders_count')
    .eq('id', instanceId)
    .eq('user_id', authUser.id)
    .maybeSingle();
  if (instErr || !instance) return c.json({ error: 'Instance not found.' }, 404);

  const { data, error } = await admin
    .from('voxel_library')
    .insert({
      user_id: authUser.id,
      title: String(title || `${instance.name} VPack`).slice(0, 200),
      type: 'vpack',
      source: 'voxelplus',
      metadata: {
        origin: 'instance_conversion',
        source_instance_id: instance.id,
        source_version: instance.version,
        description: description || '',
        installed: false
      }
    })
    .select('id')
    .single();
  if (error) return c.json({ error: 'Conversion failed.' }, 503);

  await evaluateAchievements(admin, authUser.id);
  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'vpack.converted',
    resource: 'voxel_library',
    details: { vpack_id: data?.id, source_instance_id: instance.id }
  });
  return c.json({ id: data?.id });
});

/**
 * POST /api/vpacks/:id/install — mark a VPack installed.
 * Only the owner's own vpack row can be marked installed.
 */
vpacksRouter.post('/:id/install', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const id = c.req.param('id');
  const admin = getAdminSupabaseClient();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { data: row, error } = await admin
    .from('voxel_library')
    .select('id, metadata')
    .eq('id', id)
    .eq('user_id', authUser.id)
    .eq('type', 'vpack')
    .maybeSingle();
  if (error || !row) return c.json({ error: 'VPack not found.' }, 404);

  if (row.metadata?.installed !== true) {
    const { error: updateErr } = await admin
      .from('voxel_library')
      .update({ metadata: { ...row.metadata, installed: true } })
      .eq('id', id)
      .eq('user_id', authUser.id);
    if (updateErr) return c.json({ error: 'Install state could not be recorded.' }, 503);
  }

  await evaluateAchievements(admin, authUser.id);
  return c.json({ id, installed: true });
});
