-- Voxel+ Account System Initial Database Migration
-- Target Platform: Supabase PostgreSQL with Row Level Security (RLS)

-- 1. Voxel+ User Profiles Table (Linked to auth.users.id)
CREATE TABLE IF NOT EXISTS public.voxel_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'avatar_steve',
  bio TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Voxel+ Cloud Sync Metadata Table (Linked to auth.users.id)
CREATE TABLE IF NOT EXISTS public.voxel_cloud_sync (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sync_payload JSONB NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Voxel+ User Library Items Table
CREATE TABLE IF NOT EXISTS public.voxel_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT DEFAULT 'Voxel+',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.voxel_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_cloud_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_library ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for voxel_users
CREATE POLICY "Public profiles are readable by anyone"
  ON public.voxel_users FOR SELECT
  USING (is_public = true OR auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.voxel_users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.voxel_users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.voxel_users FOR DELETE
  USING (auth.uid() = id);

-- 6. RLS Policies for voxel_cloud_sync
CREATE POLICY "Users can access only their own cloud sync payload"
  ON public.voxel_cloud_sync FOR ALL
  USING (auth.uid() = user_id);

-- 7. RLS Policies for voxel_library
CREATE POLICY "Users can manage only their own library items"
  ON public.voxel_library FOR SELECT
  USING (auth.uid() = user_id OR (metadata->>'isPublic')::boolean = true);

CREATE POLICY "Users can insert their own library items"
  ON public.voxel_library FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own library items"
  ON public.voxel_library FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own library items"
  ON public.voxel_library FOR DELETE
  USING (auth.uid() = user_id);

-- 8. Secure PostgreSQL RPC Function for Public Creator Profile Counts
CREATE OR REPLACE FUNCTION public.get_public_user_profiles()
RETURNS TABLE (
  id UUID,
  username TEXT,
  avatar TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ,
  public_packs_count BIGINT,
  public_skins_count BIGINT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    u.id,
    u.username,
    u.avatar,
    u.bio,
    u.created_at,
    COUNT(CASE WHEN l.type = 'pack' AND (l.metadata->>'isPublic')::boolean = true THEN 1 END) AS public_packs_count,
    COUNT(CASE WHEN l.type = 'skin' AND (l.metadata->>'isPublic')::boolean = true THEN 1 END) AS public_skins_count
  FROM public.voxel_users u
  LEFT JOIN public.voxel_library l ON l.user_id = u.id
  WHERE u.is_public = true
  GROUP BY u.id, u.username, u.avatar, u.bio, u.created_at
  LIMIT 50;
$$;
