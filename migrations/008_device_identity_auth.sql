-- Voxel+ device-bound identity migration. History 001-007 is preserved.
-- Ed25519 SPKI public keys are the only Voxel+ authentication credential.
ALTER TABLE public.voxel_accounts
  ADD COLUMN IF NOT EXISTS public_key TEXT,
  ADD COLUMN IF NOT EXISTS public_key_id TEXT,
  ADD COLUMN IF NOT EXISTS username_normalized TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.voxel_accounts ALTER COLUMN username DROP NOT NULL;

-- Old credential material is deliberately removed; old password accounts are
-- not silently converted into device identities.
ALTER TABLE public.voxel_accounts DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.voxel_accounts DROP COLUMN IF EXISTS password_salt;
UPDATE public.voxel_accounts
SET username_normalized = lower(trim(username))
WHERE username_normalized IS NULL AND username IS NOT NULL;
UPDATE public.voxel_accounts
SET status = 'legacy_unbound'
WHERE public_key IS NULL OR public_key_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS voxel_accounts_public_key_id_key ON public.voxel_accounts(public_key_id);
CREATE UNIQUE INDEX IF NOT EXISTS voxel_accounts_username_normalized_key ON public.voxel_accounts(username_normalized) WHERE username_normalized IS NOT NULL;
-- Existing password rows remain non-authenticating legacy records until an
-- operator explicitly archives them; they are never accepted by this API.

CREATE TABLE IF NOT EXISTS public.voxel_auth_challenges (
  id UUID PRIMARY KEY,
  public_key_id TEXT NOT NULL REFERENCES public.voxel_accounts(public_key_id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS voxel_auth_challenges_expiry_idx ON public.voxel_auth_challenges(expires_at);
ALTER TABLE public.voxel_auth_challenges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.voxel_accounts IS 'One immutable VoxelAccountId per Voxel+ installation public key. No password, email, or recovery identity.';
COMMENT ON COLUMN public.voxel_accounts.public_key IS 'Ed25519 SPKI DER, base64 encoded. Private key never leaves the device.';
