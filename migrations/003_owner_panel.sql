-- Voxel+ Owner Control Panel & Audit Log Migration
-- Target Platform: Supabase PostgreSQL with Row Level Security (RLS)
-- IMPORTANT: Owner authorization is ALWAYS server-side. No client-side checks.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. OWNER ROLES (who has owner/admin access)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_owner_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'moderator')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.voxel_owner_roles ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write owner roles
-- No authenticated user can read the owner_roles table through RLS
-- The Cloud API owner endpoints use service_role (admin) client only

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. OWNER AUDIT LOG (privileged actions log)
--    In addition to TenantScale audit events, keep our own structured log
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.voxel_owner_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  TEXT NOT NULL,
  action      TEXT NOT NULL,   -- e.g. 'TITLE_GRANTED', 'ACCOUNT_DELETED'
  target_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_username TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.voxel_owner_audit_log ENABLE ROW LEVEL SECURITY;
-- No user-readable policies — owner audit log is service_role only

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. RPC: Check if caller is owner/admin (used by Cloud API)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION public.is_voxelplus_owner_or_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.voxel_owner_roles
    WHERE user_id = check_user_id
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_voxelplus_owner_or_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_voxelplus_owner_or_admin(UUID) TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. RPC: Get extended user profile for owner panel
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION public.get_user_admin_profile(target_user_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id',           u.id,
    'username',     u.username,
    'avatar',       COALESCE(u.avatar_url, u.avatar),
    'bio',          u.bio,
    'is_public',    u.is_public,
    'is_creator',   u.is_creator,
    'created_at',   u.created_at,
    'updated_at',   u.updated_at,
    'selected_cosmetic', u.selected_cosmetic,
    'selected_title',    u.selected_title,
    'titles',       COALESCE((
      SELECT jsonb_agg(t.name ORDER BY ut.granted_at)
      FROM public.voxel_user_titles ut
      JOIN public.voxel_titles t ON t.id = ut.title_id
      WHERE ut.user_id = target_user_id
    ), '[]'::jsonb),
    'badges',       COALESCE((
      SELECT jsonb_agg(b.name ORDER BY ub.granted_at)
      FROM public.voxel_user_badges ub
      JOIN public.voxel_badges b ON b.id = ub.badge_id
      WHERE ub.user_id = target_user_id
    ), '[]'::jsonb),
    'achievements', COALESCE((
      SELECT jsonb_agg(a.title ORDER BY ua.unlocked_at)
      FROM public.voxel_user_achievements ua
      JOIN public.voxel_achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = target_user_id
    ), '[]'::jsonb),
    'library_count', COALESCE((
      SELECT COUNT(*) FROM public.voxel_library WHERE user_id = target_user_id
    ), 0),
    'role',         r.role
  )
  FROM public.voxel_users u
  LEFT JOIN public.voxel_owner_roles r ON r.user_id = u.id
  WHERE u.id = target_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_admin_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_admin_profile(UUID) TO service_role;
