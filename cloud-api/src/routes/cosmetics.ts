import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getDataStore } from '../store.js';
import { logAuditEventServer } from '../audit.js';
import { ADS_REQUIRED } from '../ads.js';

export const cosmeticsRouter = new Hono<CloudApiEnv>();

/**
 * GET /api/cosmetics — list all cosmetics user has unlocked
 */
cosmeticsRouter.get('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const db = getDataStore();
  if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);

  const { data, error } = await (db as any)
    .table('voxel_user_cosmetics')
    .select('cosmetic_id, unlocked_at')
    .eq('user_id', authUser.id);

  if (error) return c.json({ error: error.message }, 400);

  // Join to the catalog server-side (keeps the data client simple and works
  // identically on every backend).
  const ids = (data || []).map((r: any) => r.cosmetic_id);
  const catalog = new Map<string, any>();
  if (ids.length > 0) {
    const { data: items } = await (db as any)
      .table('voxel_cosmetics')
      .select('id, name, type, icon, rarity, description')
      .in('id', ids);
    for (const item of items || []) catalog.set(item.id, item);
  }

  const cosmetics = (data || []).map((row: any) => {
    const item = catalog.get(row.cosmetic_id) || {};
    return {
      id: item.id ?? row.cosmetic_id,
      name: item.name,
      type: item.type,
      icon: item.icon,
      rarity: item.rarity,
      description: item.description,
      unlockedAt: row.unlocked_at
    };
  });

  return c.json(cosmetics);
});

/**
 * PUT /api/cosmetics/select — user selects their active cosmetic
 * Server validates user actually owns the cosmetic before saving.
 */
cosmeticsRouter.put('/select', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { cosmeticId } = body;

  const db = getDataStore();
  if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);

  if (cosmeticId !== null) {
    // Verify user owns this cosmetic
    const { data: owned } = await (db as any)
      .table('voxel_user_cosmetics')
      .select('cosmetic_id')
      .eq('user_id', authUser.id)
      .eq('cosmetic_id', cosmeticId)
      .maybeSingle();

    if (!owned) {
      return c.json({ error: 'You do not own this cosmetic.' }, 403);
    }
  }

  const { error } = await (db as any)
    .table('voxel_users')
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
  const db = getDataStore();
  if (!db) return c.json({ error: 'Catalog unavailable.' }, 503);

  const { data, error } = await (db as any)
    .table('voxel_cosmetics')
    .select('id, name, type, icon, rarity, description, unlock_condition')
    .eq('enabled', true)
    .order('rarity');

  if (error) return c.json({ error: 'Catalog unavailable.' }, 503);
  return c.json((data || []).map((item: any) => ({
    ...item,
    adsRequired: ADS_REQUIRED.cosmetic(item)
  })));
});
