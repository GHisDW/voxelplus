import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getAdminSupabaseClient, getUserSupabaseClient } from '../supabase.js';
import { evaluateAchievements } from '../achievementEngine.js';

export const achievementsRouter = new Hono<CloudApiEnv>();

/**
 * GET /api/achievements/catalog — public achievement catalog.
 * Hidden achievements are never exposed: their title, description and
 * conditions stay server-side until a user unlocks them.
 * Returns 503 on backend failure — never an empty list pretending nothing exists.
 */
achievementsRouter.get('/catalog', async (c) => {
  const { getPublicSupabaseClient } = await import('../supabase.js');
  const supabase = getPublicSupabaseClient();
  if (!supabase) return c.json({ error: 'Catalog unavailable.' }, 503);

  const { data, error } = await supabase
    .from('voxel_achievements')
    .select('id, title, description, icon, requirement, category, rarity, hidden, reward_cosmetic_id, reward_title_id, reward_badge_id')
    .eq('enabled', true)
    .order('rarity');

  if (error) return c.json({ error: 'Catalog unavailable.' }, 503);
  return c.json((data || []).map((a: any) => maskHidden(a, null)));
});

/**
 * GET /api/achievements — the user's achievements view.
 * Runs the server-side engine first (idempotent), then returns catalog entries
 * merged with unlock state and live progress toward each condition.
 * Hidden achievements appear only once unlocked.
 */
achievementsRouter.get('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const userSupabase = getUserSupabaseClient(token);
  const adminSupabase = getAdminSupabaseClient();

  if (!userSupabase) return c.json({ error: 'Cloud service unconfigured.' }, 503);
  if (!adminSupabase) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  // Evaluate first so newly-satisfied conditions unlock immediately.
  await evaluateAchievements(adminSupabase, authUser.id);

  const { data: allAchievements, error: achErr } = await userSupabase
    .from('voxel_achievements')
    .select('*')
    .eq('enabled', true)
    .order('rarity');
  if (achErr) return c.json({ error: 'Achievements unavailable.' }, 503);

  const { data: userAchievements, error: uaErr } = await userSupabase
    .from('voxel_user_achievements')
    .select('achievement_id, unlocked_at')
    .eq('user_id', authUser.id);
  if (uaErr) return c.json({ error: 'Achievements unavailable.' }, 503);

  const unlockedMap = new Map((userAchievements || []).map((ua: any) => [ua.achievement_id, ua.unlocked_at]));

  const result = (allAchievements || [])
    .map((a: any) => {
      const unlockedAt = unlockedMap.get(a.id) || null;
      const base = {
        id: a.id,
        title: a.title,
        description: a.description,
        icon: a.icon,
        category: a.category || 'general',
        requirement: a.requirement,
        rarity: a.rarity,
        hidden: a.hidden === true,
        unlocked: !!unlockedAt,
        unlockedAt,
        reward: {
          cosmetic: a.reward_cosmetic_id || null,
          title: a.reward_title_id || null,
          badge: a.reward_badge_id || null
        }
      };
      // Locked hidden achievements expose nothing identifying.
      return maskHidden(base, unlockedAt);
    });

  return c.json(result);
});

export function maskHidden(a: any, unlockedAt?: string | null) {
  if (a.hidden === true && !unlockedAt) {
    return {
      id: a.id,
      title: '???',
      description: 'Hidden achievement',
      icon: '❓',
      category: a.category || 'hidden',
      requirement: 'Hidden',
      rarity: a.rarity,
      hidden: true,
      unlocked: false,
      unlockedAt: null,
      reward: { cosmetic: null, title: null, badge: null }
    };
  }
  return a;
}
