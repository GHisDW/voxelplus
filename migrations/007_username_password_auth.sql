-- Migration 007: Voxel+ username+password identity (replaces Supabase Auth)
--
-- Voxel+ accounts are username+password — no email, no Supabase Auth users.
-- Credentials live in voxel_accounts (scrypt hashes), sessions in
-- voxel_sessions (SHA-256 token hashes with expiry). voxel_users stays the
-- profile table; its FK to auth.users is dropped so profile ids can be
-- ordinary Voxel+ account ids.
--
-- AUDIT: voxel_audit_events replaces the TenantScale ts_audit_events write
-- path (TenantScale still receives events when configured).

-- 1. Accounts (credentials). NEVER exposed to non-service roles.
CREATE TABLE IF NOT EXISTS public.voxel_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique usernames.
CREATE UNIQUE INDEX IF NOT EXISTS voxel_accounts_username_lower_key
  ON public.voxel_accounts (lower(username));

ALTER TABLE public.voxel_accounts ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. Users can never read credential rows.

-- 2. Sessions (opaque bearer tokens, stored hashed).
CREATE TABLE IF NOT EXISTS public.voxel_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.voxel_accounts(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voxel_sessions_user_idx ON public.voxel_sessions (user_id);

ALTER TABLE public.voxel_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

-- 3. Audit events (DB-backed audit trail; TenantScale remains optional).
CREATE TABLE IF NOT EXISTS public.voxel_audit_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID,
  actor_id   UUID,
  actor_type TEXT NOT NULL,
  action     TEXT NOT NULL,
  resource   TEXT,
  details    JSONB NOT NULL DEFAULT '{}',
  ip         TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voxel_audit_events_actor_idx ON public.voxel_audit_events (actor_id);
CREATE INDEX IF NOT EXISTS voxel_audit_events_time_idx ON public.voxel_audit_events (created_at DESC);

ALTER TABLE public.voxel_audit_events ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

-- 4. Profiles are keyed by Voxel+ account id, not auth.users.
ALTER TABLE public.voxel_users DROP CONSTRAINT IF EXISTS voxel_users_id_fkey;
ALTER TABLE public.voxel_users
  ADD CONSTRAINT voxel_users_id_fkey
  FOREIGN KEY (id) REFERENCES public.voxel_accounts(id) ON DELETE CASCADE;

-- 5. Other per-user tables that referenced auth.users now reference
--    voxel_accounts (or the profile id which itself references it).
DO $$
DECLARE
  t TEXT;
  fk_tables TEXT[] := ARRAY[
    'voxel_cloud_sync', 'voxel_library', 'voxel_user_cosmetics',
    'voxel_user_achievements', 'voxel_user_titles', 'voxel_user_badges',
    'voxel_instances', 'voxel_ad_progress', 'voxel_ad_completions',
    'voxel_owner_roles', 'voxel_account_deletion_queue'
  ];
BEGIN
  FOREACH t IN ARRAY fk_tables LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_user_id_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES public.voxel_accounts(id) ON DELETE CASCADE',
      t, t || '_user_id_fkey'
    );
  END LOOP;
END $$;
