/**
 * Server-side achievement engine.
 *
 * Achievements unlock ONLY from server-evaluated conditions computed against
 * authoritative database state. There is no client-reported event path:
 * clients can never claim an achievement; the engine re-derives metrics after
 * real mutations (instance creation, library saves, verified ad grants,
 * profile updates, VPack operations) and unlocks whatever conditions are met.
 *
 * Unlock + reward is idempotent: user_achievement/cosmetic/title/badge rows
 * are upserts keyed by unique constraints, so concurrent evaluations produce
 * exactly one achievement and one reward.
 */

export interface AchievementRow {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  category?: string;
  rarity?: string;
  hidden?: boolean;
  enabled?: boolean;
  condition_type?: string | null;
  condition_value?: number | null;
  reward_cosmetic_id?: string | null;
  reward_title_id?: string | null;
  reward_badge_id?: string | null;
}

export interface AchievementEvaluation {
  userId: string;
  /** achievement ids unlocked during this evaluation */
  unlocked: string[];
  /** reward grant failures surfaced honestly (never silently swallowed) */
  rewardFailures: { achievementId: string; reward: string; error: string }[];
  /** evaluation itself could not be performed (e.g. catalog read failed) */
  error?: string;
}

/** Lifetime metric counters computed from authoritative DB state. */
export async function computeMetrics(admin: any, userId: string): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {
    instances_total: 0,
    versions_distinct: 0,
    cosmetics_owned: 0,
    effects_owned: 0,
    vpacks_created: 0,
    vpacks_installed: 0,
    vpacks_converted: 0,
    library_total: 0,
    packs_public: 0,
    mods_installed: 0,
    shaders_installed: 0,
    profile_public: 0,
    custom_avatar: 0,
    legendary_owned: 0
  };

  // Lifetime instance counter maintained on the profile row.
  const { data: profile } = await admin
    .table('voxel_users')
    .select('instances_created_total, is_public, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (profile) {
    metrics.instances_total = profile.instances_created_total ?? 0;
    metrics.profile_public = profile.is_public ? 1 : 0;
    metrics.custom_avatar = profile.avatar_url ? 1 : 0;
  }

  const { data: instances } = await admin
    .table('voxel_instances')
    .select('version, mods_count, shaders_count')
    .eq('user_id', userId);
  const rows = instances || [];
  metrics.versions_distinct = new Set(rows.map((r: any) => r.version).filter(Boolean)).size;
  metrics.mods_installed = rows.reduce((sum: number, r: any) => sum + Math.max(0, Number(r.mods_count) || 0), 0);
  metrics.shaders_installed = rows.reduce((sum: number, r: any) => sum + Math.max(0, Number(r.shaders_count) || 0), 0);

  const { data: owned } = await admin
    .table('voxel_user_cosmetics')
    .select('cosmetic_id')
    .eq('user_id', userId);
  const ownedIds = (owned || []).map((o: any) => o.cosmetic_id);
  if (ownedIds.length) {
    const { data: cosmeticRows } = await admin
      .table('voxel_cosmetics')
      .select('id, type, rarity')
      .in('id', ownedIds);
    const list = cosmeticRows || [];
    metrics.effects_owned = list.filter((c: any) => c.type === 'effect').length;
    metrics.cosmetics_owned = list.length - metrics.effects_owned;
    metrics.legendary_owned = list.some((c: any) => c.rarity === 'legendary') ? 1 : 0;
  }

  const { data: library } = await admin
    .table('voxel_library')
    .select('type, metadata')
    .eq('user_id', userId);
  const lib = library || [];
  metrics.library_total = lib.length;
  const vpacks = lib.filter((r: any) => r.type === 'vpack');
  const created = vpacks.filter((r: any) => r.metadata?.origin === 'created' || r.metadata?.origin === 'instance_conversion');
  metrics.vpacks_created = created.length;
  metrics.vpacks_installed = vpacks.filter((r: any) => r.metadata?.installed === true).length;
  metrics.vpacks_converted = vpacks.filter((r: any) => r.metadata?.origin === 'instance_conversion').length;
  metrics.packs_public = lib.filter((r: any) => r.type === 'pack' && r.metadata?.isPublic === true).length;

  return metrics;
}

async function grantReward(
  admin: any,
  userId: string,
  achievement: AchievementRow
): Promise<{ ok: boolean; reward: string; error?: string }> {
  try {
    if (achievement.reward_cosmetic_id) {
      const { error } = await admin
        .table('voxel_user_cosmetics')
        .upsert(
          { user_id: userId, cosmetic_id: achievement.reward_cosmetic_id },
          { onConflict: 'user_id,cosmetic_id', ignoreDuplicates: true }
        );
      if (error) return { ok: false, reward: `cosmetic:${achievement.reward_cosmetic_id}`, error: error.message };
      return { ok: true, reward: `cosmetic:${achievement.reward_cosmetic_id}` };
    }
    if (achievement.reward_title_id) {
      const { error } = await admin
        .table('voxel_user_titles')
        .upsert(
          { user_id: userId, title_id: achievement.reward_title_id },
          { onConflict: 'user_id,title_id', ignoreDuplicates: true }
        );
      if (error) return { ok: false, reward: `title:${achievement.reward_title_id}`, error: error.message };
      return { ok: true, reward: `title:${achievement.reward_title_id}` };
    }
    if (achievement.reward_badge_id) {
      const { error } = await admin
        .table('voxel_user_badges')
        .upsert(
          { user_id: userId, badge_id: achievement.reward_badge_id },
          { onConflict: 'user_id,badge_id', ignoreDuplicates: true }
        );
      if (error) return { ok: false, reward: `badge:${achievement.reward_badge_id}`, error: error.message };
      return { ok: true, reward: `badge:${achievement.reward_badge_id}` };
    }
    return { ok: true, reward: 'none' };
  } catch (err: any) {
    return { ok: false, reward: 'unknown', error: err?.message || String(err) };
  }
}

/** Retries durable reward records created when a provider cannot use a transaction. */
export async function reconcileAchievementRewards(admin: any, userId: string): Promise<void> {
  const { data: pending, error } = await admin.table('voxel_achievement_reward_queue').select('*').eq('user_id', userId).in('status', ['pending', 'failed']);
  if (error) throw error;
  for (const row of pending || []) {
    const { data: achievement } = await admin.table('voxel_achievements').select('id, reward_cosmetic_id, reward_title_id, reward_badge_id').eq('id', row.achievement_id).maybeSingle();
    if (!achievement) continue;
    const reward = await grantReward(admin, userId, achievement);
    await admin.table('voxel_achievement_reward_queue').update({ status: reward.ok ? 'applied' : 'failed', error: reward.ok ? null : (reward.error || 'unknown'), resolved_at: reward.ok ? new Date().toISOString() : null }).eq('id', row.id);
  }
}

/**
 * Evaluate every enabled, condition-based achievement for the user and unlock
 * whichever conditions are satisfied. Safe to call after any mutation and safe
 * to call concurrently (unique constraints + upserts keep it single-effective).
 */
export async function evaluateAchievements(admin: any, userId: string): Promise<AchievementEvaluation> {
  const result: AchievementEvaluation = { userId, unlocked: [], rewardFailures: [] };
  try {
    await reconcileAchievementRewards(admin, userId);
    const { data: catalog, error: catalogErr } = await admin
      .table('voxel_achievements')
      .select('id, condition_type, condition_value, reward_cosmetic_id, reward_title_id, reward_badge_id')
      .eq('enabled', true);
    if (catalogErr) {
      result.error = catalogErr.message;
      return result;
    }
    const conditionAchievements = (catalog || []).filter(
      (a: AchievementRow) => a.condition_type && a.condition_value != null
    );
    if (!conditionAchievements.length) return result;

    const { data: unlockedRows, error: unlockedErr } = await admin
      .table('voxel_user_achievements')
      .select('achievement_id')
      .eq('user_id', userId);
    if (unlockedErr) {
      result.error = unlockedErr.message;
      return result;
    }
    const already = new Set((unlockedRows || []).map((r: any) => r.achievement_id));
    const pending = conditionAchievements.filter((a: AchievementRow) => !already.has(a.id));
    if (!pending.length) return result;

    const metrics = await computeMetrics(admin, userId);
    for (const achievement of pending) {
      const value = metrics[achievement.condition_type as string];
      if (value == null || value < (achievement.condition_value as number)) continue;

      // Upsert: concurrent evaluations collapse to a single row via the
      // UNIQUE(user_id, achievement_id) constraint.
      const { error: insertErr } = await admin
        .table('voxel_user_achievements')
        .upsert(
          { user_id: userId, achievement_id: achievement.id, unlocked_at: new Date().toISOString() },
          { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
        );
      if (insertErr) {
        result.rewardFailures.push({ achievementId: achievement.id, reward: 'unlock', error: insertErr.message });
        continue;
      }
      result.unlocked.push(achievement.id);

      // Persistence providers without multi-table transactions get a durable
      // reconciliation record so an unlocked achievement can never silently
      // lose its reward.
      const reward = await grantReward(admin, userId, achievement);
      const rewardKind = (reward.reward || 'none').split(':')[0];
      const rewardId = (reward.reward || '').split(':')[1] || null;
      if (rewardKind !== 'none') await admin.table('voxel_achievement_reward_queue').upsert({ user_id: userId, achievement_id: achievement.id, reward_kind: rewardKind, reward_id: rewardId, status: reward.ok ? 'applied' : 'failed', error: reward.ok ? null : (reward.error || 'unknown'), resolved_at: reward.ok ? new Date().toISOString() : null }, { onConflict: 'user_id,achievement_id,reward_kind,reward_id' });
      if (!reward.ok) {
        result.rewardFailures.push({ achievementId: achievement.id, reward: reward.reward, error: reward.error || 'unknown' });
      }
    }
    return result;
  } catch (err: any) {
    result.error = err?.message || String(err);
    return result;
  }
}
