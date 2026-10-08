CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS voxel_accounts (id UUID PRIMARY KEY, public_key TEXT UNIQUE, public_key_id TEXT UNIQUE, username TEXT, username_normalized TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_users (id UUID PRIMARY KEY, username TEXT, avatar TEXT NOT NULL DEFAULT 'avatar_steve', avatar_url TEXT, bio TEXT DEFAULT '', is_public BOOLEAN DEFAULT TRUE, is_creator BOOLEAN DEFAULT FALSE, selected_cosmetic TEXT, selected_title TEXT, featured_achievement TEXT, instances_created_total INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_sessions (id UUID PRIMARY KEY, user_id UUID NOT NULL, token_hash TEXT UNIQUE NOT NULL, refresh_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS voxel_auth_challenges (id UUID PRIMARY KEY, public_key_id TEXT NOT NULL, challenge TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_cloud_sync (user_id UUID PRIMARY KEY, sync_payload JSONB NOT NULL, last_synced_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_library (id UUID PRIMARY KEY, user_id UUID NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, source TEXT DEFAULT 'Voxel+', added_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}');
CREATE TABLE IF NOT EXISTS voxel_instances (id UUID PRIMARY KEY, user_id UUID NOT NULL, name TEXT NOT NULL, version TEXT NOT NULL DEFAULT '', mods_count INTEGER NOT NULL DEFAULT 0, resourcepacks_count INTEGER NOT NULL DEFAULT 0, shaders_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_cosmetics (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, icon TEXT NOT NULL, rarity TEXT NOT NULL, description TEXT DEFAULT '', unlock_condition TEXT DEFAULT '', achievement_id TEXT, enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_user_cosmetics (id UUID PRIMARY KEY, user_id UUID NOT NULL, cosmetic_id TEXT NOT NULL, unlocked_at TIMESTAMPTZ, granted_by UUID, UNIQUE(user_id, cosmetic_id));
CREATE TABLE IF NOT EXISTS voxel_achievements (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT NOT NULL, requirement TEXT DEFAULT '', event_trigger TEXT, reward_cosmetic_id TEXT, rarity TEXT NOT NULL, hidden BOOLEAN DEFAULT FALSE, enabled BOOLEAN DEFAULT TRUE, condition_type TEXT, condition_value INTEGER, category TEXT NOT NULL DEFAULT 'general', reward_title_id TEXT, reward_badge_id TEXT, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_user_achievements (id UUID PRIMARY KEY, user_id UUID NOT NULL, achievement_id TEXT NOT NULL, unlocked_at TIMESTAMPTZ, granted_by UUID, UNIQUE(user_id, achievement_id));
CREATE TABLE IF NOT EXISTS voxel_titles (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', color TEXT DEFAULT '#a78bfa', enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_user_titles (id UUID PRIMARY KEY, user_id UUID NOT NULL, title_id TEXT NOT NULL, granted_by UUID, granted_at TIMESTAMPTZ, UNIQUE(user_id, title_id));
CREATE TABLE IF NOT EXISTS voxel_badges (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT NOT NULL, enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_user_badges (id UUID PRIMARY KEY, user_id UUID NOT NULL, badge_id TEXT NOT NULL, granted_by UUID, granted_at TIMESTAMPTZ, UNIQUE(user_id, badge_id));
CREATE TABLE IF NOT EXISTS voxel_vpack_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT NOT NULL, contents JSONB NOT NULL DEFAULT '{}', enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_ad_completions (id UUID PRIMARY KEY, user_id UUID NOT NULL, provider TEXT NOT NULL, provider_completion_id TEXT NOT NULL UNIQUE, item_kind TEXT NOT NULL, item_id TEXT NOT NULL, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_ad_progress (user_id UUID NOT NULL, item_kind TEXT NOT NULL, item_id TEXT NOT NULL, completed_count INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ, PRIMARY KEY(user_id, item_kind, item_id));
CREATE TABLE IF NOT EXISTS voxel_account_deletion_queue (id UUID PRIMARY KEY, user_id UUID NOT NULL, requested_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'pending', completed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_achievement_reward_queue (id UUID PRIMARY KEY, user_id UUID NOT NULL, achievement_id TEXT NOT NULL, reward_kind TEXT NOT NULL, reward_id TEXT, status TEXT NOT NULL DEFAULT 'pending', error TEXT, created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, UNIQUE(user_id, achievement_id, reward_kind, reward_id));
CREATE TABLE IF NOT EXISTS voxel_audit_events (id UUID PRIMARY KEY, tenant_id TEXT, actor_id UUID, actor_type TEXT NOT NULL, action TEXT NOT NULL, resource TEXT, details JSONB NOT NULL DEFAULT '{}', ip TEXT, user_agent TEXT, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS voxel_owner_roles (id UUID PRIMARY KEY, user_id UUID NOT NULL UNIQUE, role TEXT NOT NULL, granted_by UUID, granted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS voxel_owner_audit_log (id UUID PRIMARY KEY, actor_id UUID NOT NULL, actor_role TEXT NOT NULL, action TEXT NOT NULL, target_id UUID, target_username TEXT, metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS voxel_accounts_public_key_idx ON voxel_accounts(public_key_id);
CREATE INDEX IF NOT EXISTS voxel_accounts_username_idx ON voxel_accounts(username_normalized);
CREATE INDEX IF NOT EXISTS voxel_sessions_user_idx ON voxel_sessions(user_id);
CREATE INDEX IF NOT EXISTS voxel_sessions_expiry_idx ON voxel_sessions(expires_at);
CREATE INDEX IF NOT EXISTS voxel_challenges_expiry_idx ON voxel_auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS voxel_audit_actor_idx ON voxel_audit_events(actor_id);
CREATE INDEX IF NOT EXISTS voxel_audit_time_idx ON voxel_audit_events(created_at);

INSERT INTO voxel_cosmetics (id,name,type,icon,rarity,description,unlock_condition,enabled) VALUES
 ('cosmetic_dirt_block','Dirt Block','featured','🟫','common','A humble beginning.','Rewarded ads',TRUE),
 ('cosmetic_crafting_table','Crafting Table','featured','📦','common','Where creations begin.','Create an instance',TRUE),
 ('cosmetic_emerald','Emerald','featured','💚','rare','A merchant''s currency.','Rewarded ads',TRUE)
ON CONFLICT (id) DO NOTHING;
INSERT INTO voxel_titles (id,name,description,color,enabled) VALUES ('title_founder','Founder','Voxel+ Founder','#f59e0b',TRUE),('title_creator','Creator','Voxel+ Content Creator','#10b981',TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO voxel_badges (id,name,description,icon,enabled) VALUES ('badge_founder','Founder','Voxel+ Founder','👑',TRUE),('badge_community','Community','Active Voxel+ Community Member','💬',TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO voxel_achievements (id,title,description,icon,requirement,condition_type,condition_value,category,rarity,enabled) VALUES
 ('achievement_first_instance','First Steps','Create your first Minecraft instance.','🌱','Create 1 instance','instances_total',1,'instances','common',TRUE),
 ('achievement_profile_public','Going Public','Make your profile public.','💚','Set profile public','profile_public',1,'profile','common',TRUE)
ON CONFLICT (id) DO NOTHING;
INSERT INTO voxel_vpack_catalog (id,name,description,icon,contents,enabled) VALUES ('vpack_starter_survival','Starter Survival Pack','Essential mods and tweaks.','🎒','{"mods":true}',TRUE) ON CONFLICT (id) DO NOTHING;
