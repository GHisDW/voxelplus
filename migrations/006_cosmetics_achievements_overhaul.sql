-- Voxel+ Cosmetics & Achievements Overhaul Migration
-- Additive-only migration. Does not rewrite already-deployed migrations.
-- Server-authoritative: cosmetics ownership, achievement unlocks, ad progress
-- and VPacks are all written exclusively by the Cloud API service-role client.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Fix incorrect FK on voxel_cosmetics.achievement_id
--    Migration 002 pointed it at voxel_cosmetics (self). It must reference
--    voxel_achievements: it records which achievement unlocks this cosmetic.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.voxel_cosmetics
  DROP CONSTRAINT IF EXISTS voxel_cosmetics_achievement_id_fkey;
ALTER TABLE public.voxel_cosmetics
  ADD CONSTRAINT voxel_cosmetics_achievement_id_fkey
  FOREIGN KEY (achievement_id) REFERENCES public.voxel_achievements(id) ON DELETE SET NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Cosmetic types + rarities
--    'effect' is a real acquisition category (equippable cosmetics),
--    'item' is the Minecraft-item cosmetic type used by the Shop.
--    'secret' rarity is reserved for hidden achievements.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.voxel_cosmetics
  DROP CONSTRAINT IF EXISTS voxel_cosmetics_type_check;
ALTER TABLE public.voxel_cosmetics
  ADD CONSTRAINT voxel_cosmetics_type_check
  CHECK (type IN ('avatar_frame','profile_icon','title_icon','badge_icon','achievement_icon','featured','item','effect'));

ALTER TABLE public.voxel_cosmetics
  DROP CONSTRAINT IF EXISTS voxel_cosmetics_rarity_check;
ALTER TABLE public.voxel_cosmetics
  ADD CONSTRAINT voxel_cosmetics_rarity_check
  CHECK (rarity IN ('common','rare','epic','legendary'));

ALTER TABLE public.voxel_achievements
  DROP CONSTRAINT IF EXISTS voxel_achievements_rarity_check;
ALTER TABLE public.voxel_achievements
  ADD CONSTRAINT voxel_achievements_rarity_check
  CHECK (rarity IN ('common','rare','epic','legendary','secret'));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Achievements: server-evaluated conditions + non-cosmetic rewards
--    event_trigger is retained for backwards compatibility of the column
--    but is no longer authoritative: the engine uses condition_* columns.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.voxel_achievements
  ALTER COLUMN event_trigger DROP NOT NULL;
ALTER TABLE public.voxel_achievements
  ADD COLUMN IF NOT EXISTS condition_type  TEXT,          -- engine-verified metric
  ADD COLUMN IF NOT EXISTS condition_value INTEGER,       -- threshold for metric
  ADD COLUMN IF NOT EXISTS category        TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS reward_title_id TEXT REFERENCES public.voxel_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_badge_id TEXT REFERENCES public.voxel_badges(id) ON DELETE SET NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Instances (server-recorded, lifetime counter on profile)
--    Creating an instance through the API persists it and increments the
--    authoritative lifetime counter; deleting never decrements it.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.voxel_users
  ADD COLUMN IF NOT EXISTS instances_created_total INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.voxel_instances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  version            TEXT NOT NULL DEFAULT '',
  mods_count         INTEGER NOT NULL DEFAULT 0,
  resourcepacks_count INTEGER NOT NULL DEFAULT 0,
  shaders_count      INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. Rewarded-ads state (server-authoritative, provider-agnostic)
--    voxel_ad_completions stores verified provider completions; the UNIQUE
--    constraint on (provider, provider_completion_id) is the replay barrier.
--    voxel_ad_progress holds server-derived counters toward each item.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_ad_completions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL,
  provider_completion_id  TEXT NOT NULL,
  item_kind               TEXT NOT NULL CHECK (item_kind IN ('cosmetic','vpack')),
  item_id                 TEXT NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, provider_completion_id)
);

CREATE TABLE IF NOT EXISTS public.voxel_ad_progress (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_kind       TEXT NOT NULL CHECK (item_kind IN ('cosmetic','vpack')),
  item_id         TEXT NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, item_kind, item_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. VPack catalog (Shop → VPacks category)
--    Acquiring a catalog VPack (1 verified rewarded ad) creates a
--    voxel_library row of type 'vpack' with metadata.origin = 'shop'.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_vpack_catalog (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon        TEXT NOT NULL,
  contents    JSONB NOT NULL DEFAULT '{}',
  enabled     BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. RLS for new tables. SELECT own rows only; NO user-write policies —
--    all writes go through the service-role Cloud API like user_* tables.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.voxel_instances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_ad_completions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_ad_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_vpack_catalog   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voxel_instances_select_own ON public.voxel_instances;
CREATE POLICY voxel_instances_select_own
  ON public.voxel_instances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS voxel_ad_completions_select_own ON public.voxel_ad_completions;
CREATE POLICY voxel_ad_completions_select_own
  ON public.voxel_ad_completions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS voxel_ad_progress_select_own ON public.voxel_ad_progress;
CREATE POLICY voxel_ad_progress_select_own
  ON public.voxel_ad_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS voxel_vpack_catalog_select ON public.voxel_vpack_catalog;
CREATE POLICY voxel_vpack_catalog_select
  ON public.voxel_vpack_catalog FOR SELECT TO authenticated
  USING (enabled = true);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. Cosmetic effects catalog (closed set — renderer maps ids to visuals)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO public.voxel_cosmetics (id, name, type, icon, rarity, description, unlock_condition) VALUES
  ('effect_enchanted_glint',    'Enchanted Glint',   'effect', '✨', 'rare',      'A shimmering enchantment aura.', 'Complete 3 rewarded ads'),
  ('effect_golden_radiance',    'Golden Radiance',   'effect', '🌟', 'epic',      'Bathed in golden light.',        'Complete 4 rewarded ads'),
  ('effect_prismatic_shimmer',  'Prismatic Shimmer', 'effect', '🌈', 'legendary', 'A rainbow sheen worthy of the End.', 'Complete 5 rewarded ads'),
  ('effect_smoldering_ember',   'Smoldering Ember',  'effect', '🔥', 'epic',      'Nether-hot embers trail behind you.', 'Achievement unlocked'),
  ('effect_frost_aura',         'Frost Aura',        'effect', '❄️', 'rare',      'Cold as powdered snow.',            'Achievement unlocked')
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. VPack catalog seed
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO public.voxel_vpack_catalog (id, name, description, icon, contents) VALUES
  ('vpack_starter_survival', 'Starter Survival Pack', 'Essential mods and tweaks for a fresh survival world.', '🎒', '{"mods": true}'),
  ('vpack_builder_tools',    'Builder''s Toolkit',    'Block palettes and building helpers for megabuilds.',    '🧱', '{"mods": true}'),
  ('vpack_explorer_pack',    'Explorer''s Bundle',    'Waypoints, maps and traversal goodies.',                '🗺️', '{"mods": true}')
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. Achievement catalog — server-evaluated conditions only.
--     ACCOUNT_CREATED freebie is removed: no achievement fires on signup.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Legacy seeds retired (event_trigger-based). Disabled rather than deleted so
-- any rows already granted remain referentially valid.
UPDATE public.voxel_achievements SET enabled = false, event_trigger = NULL
WHERE id IN (
  'achievement_first_steps','achievement_builder','achievement_explorer',
  'achievement_collector','achievement_creator','achievement_veteran',
  'achievement_community','achievement_founder'
);

INSERT INTO public.voxel_achievements
  (id, title, description, icon, requirement, event_trigger, condition_type, condition_value, category, rarity, hidden, reward_cosmetic_id, reward_title_id, reward_badge_id)
VALUES
  -- Instances (lifetime metric; delete/recreate cannot farm)
  ('achievement_first_instance', 'First Steps',        'Create your first Minecraft instance.', '🌱', 'Create 1 instance',   NULL, 'instances_total', 1,  'instances', 'common',    false, 'cosmetic_crafting_table', NULL, NULL),
  ('achievement_instance_3',     'Settler',            'Create 3 Minecraft instances.',         '🏘️', 'Create 3 instances',  NULL, 'instances_total', 3,  'instances', 'common',    false, 'cosmetic_compass',        NULL, NULL),
  ('achievement_instance_5',     'Town Planner',       'Create 5 Minecraft instances.',         '🏗️', 'Create 5 instances',  NULL, 'instances_total', 5,  'instances', 'rare',      false, NULL,                    NULL, 'badge_community'),
  ('achievement_instance_10',    'World Builder',      'Create 10 Minecraft instances.',        '🌍', 'Create 10 instances', NULL, 'instances_total', 10, 'instances', 'epic',      false, 'cosmetic_totem',          NULL, NULL),
  ('achievement_instance_25',    'Dimension Architect','Create 25 Minecraft instances.',        '🏛️', 'Create 25 instances', NULL, 'instances_total', 25, 'instances', 'legendary', false, 'cosmetic_beacon',         'title_creator', NULL),
  -- Cosmetics owned
  ('achievement_cosmetic_1',     'First Flair',        'Own your first cosmetic.',              '🎨', 'Own 1 cosmetic',      NULL, 'cosmetics_owned', 1,  'cosmetics', 'common',    false, NULL,                    NULL, NULL),
  ('achievement_cosmetic_3',     'Stylist',            'Own 3 cosmetics.',                      '🧥', 'Own 3 cosmetics',     NULL, 'cosmetics_owned', 3,  'cosmetics', 'common',    false, 'cosmetic_book',           NULL, NULL),
  ('achievement_cosmetic_5',     'Collector',          'Own 5 cosmetics.',                      '🗃️', 'Own 5 cosmetics',    NULL, 'cosmetics_owned', 5,  'cosmetics', 'rare',      false, 'cosmetic_chest',          NULL, NULL),
  ('achievement_cosmetic_10',    'Curator',            'Own 10 cosmetics.',                     '💎', 'Own 10 cosmetics',    NULL, 'cosmetics_owned', 10, 'cosmetics', 'epic',      false, 'cosmetic_diamond',        NULL, NULL),
  ('achievement_cosmetic_25',    'Vault Keeper',       'Own 25 cosmetics.',                     '👑', 'Own 25 cosmetics',    NULL, 'cosmetics_owned', 25, 'cosmetics', 'legendary', false, 'cosmetic_ender_dragon_egg','title_featured_creator', NULL),
  -- Cosmetic effects owned
  ('achievement_effect_1',       'First Sparkle',      'Own your first cosmetic effect.',       '✨', 'Own 1 effect',        NULL, 'effects_owned',   1,  'cosmetics', 'common',    false, 'effect_frost_aura',       NULL, NULL),
  ('achievement_effect_3',       'Radiant',            'Own 3 cosmetic effects.',               '🌟', 'Own 3 effects',       NULL, 'effects_owned',   3,  'cosmetics', 'rare',      false, 'effect_smoldering_ember', NULL, NULL),
  ('achievement_effect_5',       'Prismatic',          'Own 5 cosmetic effects.',               '🌈', 'Own 5 effects',       NULL, 'effects_owned',   5,  'cosmetics', 'epic',      false, 'cosmetic_sword',          NULL, NULL),
  -- VPacks created
  ('achievement_vpack_1',        'Packer',             'Create your first VPack.',              '📦', 'Create 1 VPack',      NULL, 'vpacks_created',  1,  'vpacks',    'common',    false, NULL,                    NULL, NULL),
  ('achievement_vpack_3',        'Pack Rat',           'Create 3 VPacks.',                      '📦', 'Create 3 VPacks',     NULL, 'vpacks_created',  3,  'vpacks',    'common',    false, 'cosmetic_emerald',        NULL, NULL),
  ('achievement_vpack_5',        'Pack Master',        'Create 5 VPacks.',                      '📦', 'Create 5 VPacks',     NULL, 'vpacks_created',  5,  'vpacks',    'rare',      false, NULL,                    'title_early_supporter', NULL),
  -- VPacks installed
  ('achievement_vpi_1',          'Installer',          'Install your first VPack.',             '⬇️', 'Install 1 VPack',     NULL, 'vpacks_installed',1,  'vpacks',    'common',    false, NULL,                    NULL, NULL),
  ('achievement_vpi_3',          'Modular Mind',       'Install 3 VPacks.',                     '⬇️', 'Install 3 VPacks',    NULL, 'vpacks_installed',3,  'vpacks',    'common',    false, 'effect_frost_aura',       NULL, NULL),
  ('achievement_vpi_5',          'Full Stack',         'Install 5 VPacks.',                     '⬇️', 'Install 5 VPacks',    NULL, 'vpacks_installed',5,  'vpacks',    'rare',      false, NULL,                    NULL, 'badge_tester'),
  -- Instance → VPack conversion (authoritative source field required)
  ('achievement_conversion_1',   'Archiver',           'Convert an instance into a VPack.',     '🗜️', 'Convert 1 instance',  NULL, 'vpacks_converted',1,  'vpacks',    'common',    false, NULL,                    NULL, NULL),
  -- Minecraft versions
  ('achievement_version_1',      'Version Hopper',     'Create an instance on your first MC version.', '🧭', 'Use 1 MC version',  NULL, 'versions_distinct',1, 'minecraft', 'common',    false, NULL,                    NULL, NULL),
  ('achievement_version_3',      'Time Traveler',      'Create instances on 3 distinct MC versions.', '⏳', 'Use 3 MC versions', NULL, 'versions_distinct',3, 'minecraft', 'rare',      false, 'cosmetic_netherite',      NULL, NULL),
  -- Library content
  ('achievement_library_10',     'Archivist',          'Save 10 pieces of content to your library.', '📚', 'Save 10 items',    NULL, 'library_total',   10, 'library',   'rare',      false, 'cosmetic_book',           NULL, NULL),
  ('achievement_first_mod',      'Modded',             'Install your first mod via Voxel+.',    '🔧', 'Install 1 mod',       NULL, 'mods_installed',  1,  'minecraft', 'common',    false, NULL,                    NULL, NULL),
  ('achievement_shader_1',       'Shaded',             'Install your first shader pack.',       '💡', 'Install 1 shader',    NULL, 'shaders_installed',1, 'minecraft', 'common',    false, NULL,                    NULL, NULL),
  ('achievement_pack_public_1',  'Published',          'Publish a public pack to your library.','🚀', 'Publish 1 pack',      NULL, 'packs_public',    1,  'library',   'epic',      false, 'cosmetic_diamond',        'title_contributor', NULL),
  -- Profile
  ('achievement_profile_public', 'Going Public',       'Make your profile public.',             '💚', 'Set profile public',  NULL, 'profile_public',  1,  'profile',   'common',    false, 'cosmetic_emerald',        NULL, NULL),
  ('achievement_profile_avatar', 'Self Portrait',      'Upload a custom profile avatar.',       '🖼️', 'Upload avatar',       NULL, 'custom_avatar',   1,  'profile',   'common',    false, NULL,                    NULL, NULL),
  -- Hidden / secret
  ('achievement_secret_legend',  'Living Legend',      '???',                                   '🐲', 'Hidden achievement',  NULL, 'legendary_owned', 1,  'hidden',    'secret',    true,  'cosmetic_nether_star',     'title_founder', 'badge_founder'),
  ('achievement_secret_converter','Bulk Archiver',     '???',                                   '🗜️', 'Hidden achievement',  NULL, 'vpacks_converted',5,  'hidden',    'secret',    true,  'cosmetic_elytra_x',        NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Cosmetic used by hidden reward that is not in the earlier seed:
INSERT INTO public.voxel_cosmetics (id, name, type, icon, rarity, description, unlock_condition) VALUES
  ('cosmetic_elytra_x', 'Elytra', 'featured', '🪽', 'legendary', 'Wings of the End.', 'Achievement unlocked')
ON CONFLICT (id) DO NOTHING;

-- Ad-acquirable catalog rows: mark which existing cosmetics are shop items
-- (rewarded-ads acquisition path). Achievement-reward cosmetics keep
-- their 'Achievement unlocked' condition.
UPDATE public.voxel_cosmetics SET unlock_condition = 'Rewarded ads'
WHERE id IN ('cosmetic_dirt_block','cosmetic_grass_block','cosmetic_crafting_table','cosmetic_compass','cosmetic_chest','cosmetic_emerald');
