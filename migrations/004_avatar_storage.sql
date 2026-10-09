-- Voxel+ Avatar Storage Policy Migration
-- Target Platform: Supabase Storage with RLS
-- Validated uploads go through Cloud API → Supabase Storage bucket

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Create 'avatars' storage bucket (run via Supabase dashboard or API)
-- Storage bucket must be created manually or via Management API:
--   supabase.storage.createBucket('avatars', { public: false })
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- NOTE: Storage bucket creation is NOT SQL — it uses Supabase Management API.
-- The following RLS policies apply AFTER the bucket is created.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Storage RLS: avatars/{userId}/avatar.{ext}
--    Users can only upload to their own path.
--    Public read is allowed (avatars are public).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- IMPORTANT: These policies are applied to the storage.objects table.
-- They reference the bucket 'avatars'.

-- Allow public read of avatar files
CREATE POLICY IF NOT EXISTS "Public can read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Allow authenticated users to upload to their own path only
CREATE POLICY IF NOT EXISTS "Users upload to own avatar path"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update their own avatar
CREATE POLICY IF NOT EXISTS "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own avatar
CREATE POLICY IF NOT EXISTS "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
