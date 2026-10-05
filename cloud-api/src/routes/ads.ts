import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getAdminSupabaseClient } from '../supabase.js';
import { getAdProvider, ADS_REQUIRED } from '../ads.js';
import { evaluateAchievements } from '../achievementEngine.js';
import { logAuditEventServer } from '../audit.js';

export const adsRouter = new Hono<CloudApiEnv>();

/**
 * GET /api/ads/status — whether a rewarded-ads provider is configured.
 * The client uses this to render the acquisition path honestly: when no
 * provider exists the UI must show the item as unavailable, never fake it.
 */
adsRouter.get('/status', async (c) => {
  const provider = getAdProvider();
  return c.json({ available: !!provider, provider: provider?.name ?? null });
});

/**
 * GET /api/ads/progress — server-authoritative ad progress per item.
 */
adsRouter.get('/progress', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const admin = getAdminSupabaseClient();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  const { data, error } = await admin
    .from('voxel_ad_progress')
    .select('item_kind, item_id, completed_count')
    .eq('user_id', authUser.id);
  if (error) return c.json({ error: 'Ad progress unavailable.' }, 503);

  const progress = await Promise.all((data || []).map(async (row: any) => ({
    itemKind: row.item_kind,
    itemId: row.item_id,
    completed: row.completed_count,
    required: await requiredFor(admin, row.item_kind, row.item_id)
  })));
  return c.json(progress);
});

/**
 * POST /api/ads/complete — record a verified rewarded-ad completion.
 * Body: { itemKind: 'cosmetic'|'vpack', itemId, provider?, completionId, proof }
 *
 * The proof is verified against the configured provider; the completion is
 * recorded with a UNIQUE(provider, provider_completion_id) barrier so a proof
 * can never be replayed. When completed_count reaches the item's required
 * ads, ownership is granted server-side and achievements are re-evaluated.
 * When no provider is configured this always returns 503 ADS_UNAVAILABLE.
 */
adsRouter.post('/complete', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json().catch(() => ({}));
  const { itemKind, itemId, completionId, proof } = body as Record<string, string>;

  if (!itemKind || !itemId || !completionId || !proof) {
    return c.json({ error: 'itemKind, itemId, completionId and proof are required.' }, 400);
  }
  if (itemKind !== 'cosmetic' && itemKind !== 'vpack') {
    return c.json({ error: 'Unknown itemKind.' }, 400);
  }

  const provider = getAdProvider();
  if (!provider) {
    return c.json({ error: 'Rewarded ads are not configured.', code: 'ADS_UNAVAILABLE' }, 503);
  }

  const admin = getAdminSupabaseClient();
  if (!admin) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  // 1. Verify the completion cryptographically with the provider.
  const verification = await provider.verifyCompletion(proof, { userId: authUser.id, itemKind, itemId });
  if (!verification.verified) {
    return c.json({ error: 'Ad completion could not be verified.', code: 'AD_VERIFICATION_FAILED' }, 403);
  }
  const providerCompletionId = verification.providerCompletionId || completionId;

  // 2. Resolve the target item and required count server-side.
  const item = await resolveItem(admin, itemKind, itemId);
  if (!item) return c.json({ error: 'Unknown item.' }, 404);
  const required = ADS_REQUIRED[itemKind](item);

  // 3. Anti-replay barrier: each provider completion counts once, ever.
  const { error: completionErr } = await admin
    .from('voxel_ad_completions')
    .insert({
      user_id: authUser.id,
      provider: provider.name,
      provider_completion_id: providerCompletionId,
      item_kind: itemKind,
      item_id: itemId
    });
  if (completionErr) {
    // Unique violation → this completion was already consumed.
    if (String(completionErr.code) === '23505') {
      return c.json({ error: 'This ad completion was already used.', code: 'AD_COMPLETION_REPLAYED' }, 409);
    }
    return c.json({ error: 'Could not record ad completion.' }, 503);
  }

  // 4. Increment progress (idempotent-safe: completions are unique).
  const { data: progressRow } = await admin
    .from('voxel_ad_progress')
    .select('completed_count')
    .eq('user_id', authUser.id)
    .eq('item_kind', itemKind)
    .eq('item_id', itemId)
    .maybeSingle();
  const completed = (progressRow?.completed_count ?? 0) + 1;
  const { error: progressErr } = await admin
    .from('voxel_ad_progress')
    .upsert({
      user_id: authUser.id,
      item_kind: itemKind,
      item_id: itemId,
      completed_count: completed,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,item_kind,item_id' });
  if (progressErr) return c.json({ error: 'Could not persist ad progress.' }, 503);

  // 5. Grant ownership once the requirement is met.
  let granted = false;
  if (completed >= required) {
    granted = await grantItem(admin, authUser.id, itemKind, itemId);
    if (granted) {
      await evaluateAchievements(admin, authUser.id);
      await logAuditEventServer({
        actor_id: authUser.id,
        actor_type: 'user',
        action: 'ads.item_unlocked',
        resource: 'voxel_ad_progress',
        details: { item_kind: itemKind, item_id: itemId, required }
      });
    }
  }

  return c.json({ itemId, itemKind, completed, required, granted });
});

async function resolveItem(admin: any, itemKind: string, itemId: string): Promise<any | null> {
  if (itemKind === 'cosmetic') {
    const { data } = await admin.from('voxel_cosmetics').select('id, rarity').eq('id', itemId).eq('enabled', true).maybeSingle();
    return data;
  }
  const { data } = await admin.from('voxel_vpack_catalog').select('id').eq('id', itemId).eq('enabled', true).maybeSingle();
  return data;
}

async function requiredFor(admin: any, itemKind: 'cosmetic' | 'vpack', itemId: string): Promise<number> {
  const item = await resolveItem(admin, itemKind, itemId);
  if (!item) return itemKind === 'vpack' ? 1 : 2;
  return ADS_REQUIRED[itemKind](item);
}

async function grantItem(admin: any, userId: string, itemKind: string, itemId: string): Promise<boolean> {
  if (itemKind === 'cosmetic') {
    const { error } = await admin
      .from('voxel_user_cosmetics')
      .upsert({ user_id: userId, cosmetic_id: itemId }, { onConflict: 'user_id,cosmetic_id', ignoreDuplicates: true });
    return !error;
  }
  // VPacks land in the user's library with an authoritative shop origin.
  const { data: vpack } = await admin.from('voxel_vpack_catalog').select('name, description, icon').eq('id', itemId).maybeSingle();
  const { error } = await admin.from('voxel_library').insert({
    user_id: userId,
    title: vpack?.name || itemId,
    type: 'vpack',
    source: 'shop',
    metadata: { origin: 'shop', installed: true, vpack_id: itemId, icon: vpack?.icon, description: vpack?.description }
  });
  return !error;
}
