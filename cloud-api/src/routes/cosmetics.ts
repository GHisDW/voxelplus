import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getUserSupabaseClient, getAdminSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';
import { ADS_REQUIRED } from '../ads.js';

export const cosmeticsRouter = new Hono<CloudApiEnv>();

/**
 * GET /api/cosmetics — list all cosmetics user has unlocked
 */
cosmeticsRouter.get('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const userSupabase = getUserSupabaseClient(token);
  if (!userSupabase) return c.json({ error: 'Cloud service unconfigured.' }, 503);

  const { data, error } = await userSupabase
    .from('voxel_user_cosmetics')
    .select('cosmetic_id, unlocked_at, voxel_cosmetics(id, name, type, icon, rarity, description)')
    .eq('user_id', authUser.id);

  if (error) return c.json({ error: error.message }, 400);

  const cosmetics = (data || []).map((row: any) => ({
    id: row.voxel_cosmetics?.id,
    name: row.voxel_cosmetics?.name,
    type: row.voxel_cosmetics?.type,
    icon: row.voxel_cosmetics?.icon,
    rarity: row.voxel_cosmetics?.rarity,
    description: row.voxel_cosmetics?.description,
    unlockedAt: row.unlocked_at
  }));

  return c.json(cosmetics);
});

/**
 * PUT /api/cosmetics/select — user selects their active cosmetic
 * Server validates user actually owns the cosmetic before saving.
 */
cosmeticsRouter.put('/select', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { cosmeticId } = body;

  const userSupabase = getUserSupabaseClient(token);
  if (!userSupabase) return c.json({ error: 'Cloud service unconfigured.' }, 503);

  if (cosmeticId !== null) {
    // Verify user owns this cosmetic
    const { data: owned } = await userSupabase
      .from('voxel_user_cosmetics')
      .select('cosmetic_id')
      .eq('user_id', authUser.id)
      .eq('cosmetic_id', cosmeticId)
      .maybeSingle();

    if (!owned) {
      return c.json({ error: 'You do not own this cosmetic.' }, 403);
    }
  }

  const { error } = await userSupabase
    .from('voxel_users')
    .update({ selected_cosmetic: cosmeticId ?? null, updated_at: new Date().toISOString() })
    .eq('id', authUser.id);

  if (error) return c.json({ error: error.message }, 400);

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'cosmetic.selected',
    resource: 'voxel_users',
    details: { cosmetic_id: cosmeticId }
  });

  return c.json({ success: true, selectedCosmetic: cosmeticId });
});

/**
 * GET /api/cosmetics/catalog — public cosmetics catalog.
 * Includes the server-authoritative ad cost per item; on backend failure
 * returns 503 rather than an empty list pretending no cosmetics exist.
 */
cosmeticsRouter.get('/catalog', async (c) => {
  const { getPublicSupabaseClient } = await import('../supabase.js');
  const supabase = getPublicSupabaseClient();
  if (!supabase) return c.json({ error: 'Catalog unavailable.' }, 503);

  const { data, error } = await supabase
    .from('voxel_cosmetics')
    .select('id, name, type, icon, rarity, description, unlock_condition')
    .eq('enabled', true)
    .order('rarity');

  if (error) return c.json({ error: 'Catalog unavailable.' }, 503);
  return c.json((data || []).map((item: any) => ({
    ...item,
    adsRequired: ADS_REQUIRED.cosmetic(item)
  })));
});
