-- Voxel+ Cosmetics, Achievements, Titles & Badges Migration
-- Target Platform: Supabase PostgreSQL with Row Level Security (RLS)
-- Server-authoritative: Users cannot self-grant titles, badges, or achievements.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. COSMETICS CATALOG (Server-managed, read-only for users)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_cosmetics (
  id          TEXT PRIMARY KEY,  -- e.g. 'cosmetic_dirt_block'
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('avatar_frame','profile_icon','title_icon','badge_icon','achievement_icon','featured')),
  icon        TEXT NOT NULL,     -- emoji or URL
  rarity      TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
  description TEXT DEFAULT '',
  unlock_condition TEXT DEFAULT '',
  achievement_id TEXT REFERENCES public.voxel_cosmetics(id) ON DELETE SET NULL,
  enabled     BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. USER COSMETICS (what a user has unlocked)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_user_cosmetics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id TEXT NOT NULL REFERENCES public.voxel_cosmetics(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, cosmetic_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. ACHIEVEMENTS CATALOG (Server-managed, read-only for users)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_achievements (
  id              TEXT PRIMARY KEY,  -- e.g. 'achievement_first_steps'
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  icon            TEXT NOT NULL,     -- emoji
  requirement     TEXT DEFAULT '',   -- human-readable requirement description
  event_trigger   TEXT NOT NULL,     -- e.g. 'ACCOUNT_CREATED', 'INSTANCE_CREATED'
  reward_cosmetic_id TEXT REFERENCES public.voxel_cosmetics(id) ON DELETE SET NULL,
  rarity          TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
  hidden          BOOLEAN DEFAULT false,
  enabled         BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. USER ACHIEVEMENTS (what a user has unlocked — SERVER ONLY writes)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_user_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES public.voxel_achievements(id) ON DELETE CASCADE,
  unlocked_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, achievement_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. TITLES CATALOG (Server-managed)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_titles (
  id          TEXT PRIMARY KEY,  -- e.g. 'title_founder'
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  color       TEXT DEFAULT '#a78bfa',  -- CSS color for display
  enabled     BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. USER TITLES (granted by owner — SERVER ONLY writes)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_user_titles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id   TEXT NOT NULL REFERENCES public.voxel_titles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, title_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. BADGES CATALOG (Server-managed)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_badges (
  id          TEXT PRIMARY KEY,  -- e.g. 'badge_verified'
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon        TEXT NOT NULL,     -- emoji
  enabled     BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. USER BADGES (granted by owner — SERVER ONLY writes)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL REFERENCES public.voxel_badges(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. Profile extensions: selected cosmetic, selected title
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.voxel_users
  ADD COLUMN IF NOT EXISTS selected_cosmetic TEXT REFERENCES public.voxel_cosmetics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_title    TEXT REFERENCES public.voxel_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS featured_achievement TEXT REFERENCES public.voxel_achievements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_creator        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT;  -- Supabase Storage URL for uploaded avatar

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. Enable RLS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.voxel_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_user_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_user_badges ENABLE ROW LEVEL SECURITY;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 11. RLS Policies — Catalog tables: readable by all authenticated users
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE POLICY "Cosmetics catalog readable by authenticated users"
  ON public.voxel_cosmetics FOR SELECT TO authenticated USING (enabled = true);

CREATE POLICY "Achievements catalog readable by authenticated users"
  ON public.voxel_achievements FOR SELECT TO authenticated USING (enabled = true);

CREATE POLICY "Titles catalog readable by authenticated users"
  ON public.voxel_titles FOR SELECT TO authenticated USING (enabled = true);

CREATE POLICY "Badges catalog readable by authenticated users"
  ON public.voxel_badges FOR SELECT TO authenticated USING (enabled = true);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 12. RLS Policies — User tables: read own, NO self-write
--     All inserts go through service_role (Cloud API admin client)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE POLICY "Users can read their own cosmetics"
  ON public.voxel_user_cosmetics FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read their own achievements"
  ON public.voxel_user_achievements FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read their own titles"
  ON public.voxel_user_titles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read their own badges"
  ON public.voxel_user_badges FOR SELECT USING (auth.uid() = user_id);

-- IMPORTANT: NO INSERT/UPDATE/DELETE policies on user_* tables for regular users.
-- All writes to voxel_user_cosmetics, voxel_user_achievements, voxel_user_titles,
-- voxel_user_badges go through the Cloud API using service_role (admin client).
-- This prevents users from self-granting achievements, titles, or badges.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 13. Seed: Cosmetics catalog
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO public.voxel_cosmetics (id, name, type, icon, rarity, description, unlock_condition) VALUES
  ('cosmetic_dirt_block',       'Dirt Block',        'featured', '🟫', 'common',    'A humble beginning.', 'Create a Voxel+ account'),
  ('cosmetic_grass_block',      'Grass Block',       'featured', '🟩', 'common',    'The surface of the world.', 'Login 3 days in a row'),
  ('cosmetic_crafting_table',   'Crafting Table',    'featured', '📦', 'common',    'Where creations begin.', 'Create your first instance'),
  ('cosmetic_compass',          'Compass',           'featured', '🧭', 'rare',      'Points toward adventure.', 'Install your first Shop item'),
  ('cosmetic_chest',            'Chest',             'featured', '🗃️', 'rare',      'A collector''s pride.', 'Save 10 pieces of content'),
  ('cosmetic_diamond',          'Diamond',           'featured', '💎', 'epic',      'The rarest of treasures.', 'Publish your first Voxel+ pack'),
  ('cosmetic_netherite',        'Netherite Ingot',   'featured', '⬛', 'epic',      'Forged in the Nether.', 'Use Voxel+ on multiple MC versions'),
  ('cosmetic_emerald',          'Emerald',           'featured', '💚', 'rare',      'A merchant''s currency.', 'Make your profile public'),
  ('cosmetic_nether_star',      'Nether Star',       'featured', '⭐', 'legendary', 'The rarest cosmetic.', 'Reserved for Voxel+ Founders'),
  ('cosmetic_ender_dragon_egg', 'Dragon Egg',        'featured', '🥚', 'legendary', 'The ultimate trophy.', 'Reserved for Voxel+ Team'),
  ('cosmetic_beacon',           'Beacon',            'featured', '🔷', 'legendary', 'A beacon of light.', 'Achievement unlocked'),
  ('cosmetic_totem',            'Totem of Undying',  'featured', '🪄', 'epic',      'Cheating death.',    'Achievement unlocked'),
  ('cosmetic_book',             'Enchanted Book',    'badge_icon','📕', 'common',   'Knowledge is power.', 'Achievement unlocked'),
  ('cosmetic_sword',            'Diamond Sword',     'badge_icon','⚔️', 'rare',     'Ready for battle.', 'Achievement unlocked')
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 14. Seed: Achievements catalog
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO public.voxel_achievements (id, title, description, icon, requirement, event_trigger, reward_cosmetic_id, rarity) VALUES
  ('achievement_first_steps',  'First Steps',  'Create a Voxel+ account.',          '🟫', 'Create account',            'ACCOUNT_CREATED',     'cosmetic_dirt_block',     'common'),
  ('achievement_builder',      'Builder',      'Create your first Minecraft instance.','📦', 'Create first instance',  'INSTANCE_CREATED',    'cosmetic_crafting_table', 'common'),
  ('achievement_explorer',     'Explorer',     'Install your first Shop item.',       '🧭', 'Install Shop content',     'CONTENT_INSTALLED',   'cosmetic_compass',        'rare'),
  ('achievement_collector',    'Collector',    'Save 10 pieces of content.',          '🗃️', 'Save 10 items',           'LIBRARY_TEN_ITEMS',   'cosmetic_chest',          'rare'),
  ('achievement_creator',      'Creator',      'Publish your first Voxel+ pack.',    '💎', 'Publish a pack',           'PACK_PUBLISHED',      'cosmetic_diamond',        'epic'),
  ('achievement_veteran',      'Veteran',      'Use Voxel+ on multiple MC versions.', '⬛', 'Multiple MC versions',    'MULTI_VERSION',       'cosmetic_netherite',      'epic'),
  ('achievement_community',    'Community',    'Make your profile public.',           '💚', 'Set profile public',       'PROFILE_MADE_PUBLIC', 'cosmetic_emerald',        'rare'),
  ('achievement_founder',      'Founder',      'Reserved for qualifying early Voxel+ users.','⭐', 'Founder status',   'FOUNDER_GRANTED',     'cosmetic_nether_star',    'legendary')
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 15. Seed: Titles catalog
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO public.voxel_titles (id, name, description, color) VALUES
  ('title_founder',         'Founder',          'Voxel+ Founder',              '#f59e0b'),
  ('title_developer',       'Developer',        'Voxel+ Developer',            '#3b82f6'),
  ('title_creator',         'Creator',          'Voxel+ Content Creator',      '#10b981'),
  ('title_contributor',     'Contributor',      'Voxel+ Contributor',          '#8b5cf6'),
  ('title_tester',          'Beta Tester',      'Voxel+ Beta Tester',          '#6366f1'),
  ('title_moderator',       'Moderator',        'Voxel+ Moderator',            '#ef4444'),
  ('title_community',       'Community',        'Community Member',             '#6b7280'),
  ('title_featured_creator','Featured Creator', 'Featured Voxel+ Creator',     '#f59e0b'),
  ('title_voxelplus_team',  'Voxel+ Team',      'Official Voxel+ Team Member', '#3b82f6'),
  ('title_early_supporter', 'Early Supporter',  'Early Voxel+ Supporter',      '#a78bfa')
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 16. Seed: Badges catalog
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO public.voxel_badges (id, name, description, icon) VALUES
  ('badge_verified',       'Verified',      'Verified Voxel+ Account',        '✅'),
  ('badge_developer',      'Developer',     'Voxel+ Developer',               '🛠'),
  ('badge_creator',        'Creator',       'Content Creator',                 '⚒'),
  ('badge_beta_tester',    'Beta Tester',   'Voxel+ Beta Tester',             '🧪'),
  ('badge_featured',       'Featured',      'Featured by the Voxel+ Team',    '⭐'),
  ('badge_founder',        'Founder',       'Voxel+ Founder',                 '👑'),
  ('badge_community',      'Community',     'Active Community Member',         '💬'),
  ('badge_event_winner',   'Event Winner',  'Voxel+ Event Winner',            '🏆')
ON CONFLICT (id) DO NOTHING;
