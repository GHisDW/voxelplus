import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getAdminSupabaseClient, getUserSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';

export const achievementsRouter = new Hono<CloudApiEnv>();

/**
 * GET /api/achievements/catalog — public list of all achievements
 */
achievementsRouter.get('/catalog', async (c) => {
  const { getPublicSupabaseClient } = await import('../supabase.js');
  const supabase = getPublicSupabaseClient();
  if (!supabase) return c.json([]);

  const { data, error } = await supabase
    .from('voxel_achievements')
    .select('id, title, description, icon, requirement, reward_cosmetic_id, rarity, hidden')
    .eq('enabled', true)
    .order('rarity');

  if (error) return c.json([]);
  return c.json(data || []);
});

/**
 * GET /api/achievements — list all available achievements + user's unlocked ones
 * Server evaluates which the user has unlocked based on their actual activity.
 */
achievementsRouter.get('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const userSupabase = getUserSupabaseClient(token);

  if (!userSupabase) return c.json({ error: 'Cloud service unconfigured.' }, 503);

  // Fetch all enabled achievements
  const { data: allAchievements, error: achErr } = await userSupabase
    .from('voxel_achievements')
    .select('*')
    .eq('enabled', true)
    .order('rarity');

  if (achErr) return c.json({ error: achErr.message }, 400);

  // Fetch user's unlocked achievements
  const { data: userAchievements } = await userSupabase
    .from('voxel_user_achievements')
    .select('achievement_id, unlocked_at')
    .eq('user_id', authUser.id);

  const unlockedMap = new Map((userAchievements || []).map(ua => [ua.achievement_id, ua.unlocked_at]));

  const result = (allAchievements || []).map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    icon: a.icon,
    requirement: a.requirement,
    reward: a.reward_cosmetic_id,
    rarity: a.rarity,
    hidden: a.hidden,
    unlockedAt: unlockedMap.get(a.id) || null
  }));

  return c.json(result);
});

/**
 * POST /api/achievements/event — server processes an event and unlocks achievements
 * The CLIENT reports the event type; the SERVER decides if the achievement is earned.
 * Clients cannot claim specific achievement IDs directly.
 */
achievementsRouter.post('/event', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { eventType } = body;

  if (!eventType || typeof eventType !== 'string') {
    return c.json({ error: 'eventType is required.' }, 400);
  }

  // Only allow known event types — prevent clients from sending arbitrary strings
  const ALLOWED_EVENTS = [
    'ACCOUNT_CREATED', 'INSTANCE_CREATED', 'CONTENT_INSTALLED',
    'LIBRARY_TEN_ITEMS', 'PACK_PUBLISHED', 'MULTI_VERSION',
    'PROFILE_MADE_PUBLIC', 'FOUNDER_GRANTED'
  ];

  if (!ALLOWED_EVENTS.includes(eventType)) {
    return c.json({ error: 'Unknown event type.' }, 400);
  }

  const adminSupabase = getAdminSupabaseClient();
  if (!adminSupabase) return c.json({ error: 'Privileged admin client unconfigured.' }, 503);

  // Find achievements triggered by this event
  const { data: triggered } = await adminSupabase
    .from('voxel_achievements')
    .select('id, reward_cosmetic_id')
    .eq('event_trigger', eventType)
    .eq('enabled', true);

  if (!triggered || triggered.length === 0) {
    return c.json({ unlocked: [] });
  }

  const unlocked: string[] = [];

  for (const ach of triggered) {
    // Server validates: user doesn't already have this achievement
    const { data: existing } = await adminSupabase
      .from('voxel_user_achievements')
      .select('id')
      .eq('user_id', authUser.id)
      .eq('achievement_id', ach.id)
      .maybeSingle();

    if (existing) continue; // Already unlocked

    // Grant achievement
    const { error: insertErr } = await adminSupabase
      .from('voxel_user_achievements')
      .insert({ user_id: authUser.id, achievement_id: ach.id });

    if (insertErr) {
      console.error('[Achievements] Failed to unlock:', ach.id, insertErr.message);
      continue;
    }

    unlocked.push(ach.id);

    // Auto-grant reward cosmetic if applicable
    if (ach.reward_cosmetic_id) {
      await adminSupabase
        .from('voxel_user_cosmetics')
        .upsert(
          { user_id: authUser.id, cosmetic_id: ach.reward_cosmetic_id },
          { onConflict: 'user_id, cosmetic_id', ignoreDuplicates: true }
        );
    }

    await logAuditEventServer({
      actor_id: authUser.id,
      actor_type: 'user',
      action: 'achievement.unlocked',
      resource: 'voxel_user_achievements',
      details: { achievement_id: ach.id, event_trigger: eventType }
    });
  }

  return c.json({ unlocked });
});
