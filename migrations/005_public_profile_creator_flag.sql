-- Voxel+ Public Profiles: expose the real creator flag via the public RPC.
-- Also returns avatar_url so public profiles resolve the canonical avatar
-- (uploaded avatar_url takes precedence over the `avatar` preset id).
-- The return type changes, so the function must be dropped before recreation.
DROP FUNCTION IF EXISTS public.get_public_user_profiles();

CREATE OR REPLACE FUNCTION public.get_public_user_profiles()
RETURNS TABLE (
  id UUID,
  username TEXT,
  avatar TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ,
  public_packs_count BIGINT,
  public_skins_count BIGINT,
  is_creator BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    u.username,
    u.avatar,
    u.avatar_url,
    u.bio,
    u.created_at,
    COUNT(CASE WHEN l.type = 'pack' AND (l.metadata->>'isPublic')::boolean = true THEN 1 END) AS public_packs_count,
    COUNT(CASE WHEN l.type = 'skin' AND (l.metadata->>'isPublic')::boolean = true THEN 1 END) AS public_skins_count,
    COALESCE(u.is_creator, false) AS is_creator
  FROM public.voxel_users u
  LEFT JOIN public.voxel_library l ON l.user_id = u.id
  WHERE u.is_public = true
  GROUP BY u.id, u.username, u.avatar, u.avatar_url, u.bio, u.created_at, u.is_creator
  LIMIT 50;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_user_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_user_profiles() TO anon, authenticated, service_role;
