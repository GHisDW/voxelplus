import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getAdminSupabaseClient, getUserSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';

export const avatarRouter = new Hono<CloudApiEnv>();

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/**
 * POST /api/avatar — upload avatar image to Supabase Storage
 * Validates: MIME type, extension, file size, then uploads to avatars/{userId}/avatar.{ext}
 */
avatarRouter.post('/', authMiddleware, handleAvatarUpload);
avatarRouter.post('/upload', authMiddleware, handleAvatarUpload);

async function handleAvatarUpload(c: any) {
  const authUser = c.get('authUser');
  const token = c.get('authToken');

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Expected multipart/form-data with an image file.' }, 400);
  }

  const file = formData.get('avatar') as File | null;
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded. Include "avatar" field in form data.' }, 400);
  }

  // MIME type validation
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return c.json({
      error: `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP, GIF.`,
      code: 'INVALID_MIME_TYPE'
    }, 415);
  }

  // Extension validation
  const fileName = file.name?.toLowerCase() || '';
  const hasValidExt = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  if (!hasValidExt) {
    return c.json({
      error: `Unsupported file extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      code: 'INVALID_EXTENSION'
    }, 415);
  }

  // File size validation
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return c.json({
      error: `Avatar file too large. Maximum size is 2 MB (got ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
      code: 'FILE_TOO_LARGE'
    }, 413);
  }

  const adminSupabase = getAdminSupabaseClient();
  if (!adminSupabase) {
    return c.json({ error: 'Storage service unconfigured.' }, 503);
  }

  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '.png';
  const storagePath = `${authUser.id}/avatar${ext}`;

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  // Upload to Supabase Storage (admin client bypasses RLS for upload)
  const { data: uploadData, error: uploadError } = await adminSupabase.storage
    .from('avatars')
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: true, // Replace existing avatar
    });

  if (uploadError) {
    return c.json({ error: `Storage upload failed: ${uploadError.message}`, code: 'UPLOAD_FAILED' }, 500);
  }

  // Get public URL
  const { data: urlData } = adminSupabase.storage
    .from('avatars')
    .getPublicUrl(storagePath);

  const avatarUrl = urlData?.publicUrl;
  if (!avatarUrl) {
    return c.json({ error: 'Failed to retrieve public URL for uploaded avatar.' }, 500);
  }

  // Update profile with new avatar_url
  const userSupabase = getUserSupabaseClient(token);
  if (userSupabase) {
    await userSupabase
      .from('voxel_users')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', authUser.id);
  }

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'avatar.uploaded',
    resource: 'storage.avatars',
    details: { storagePath, sizeBytes: file.size, mimeType: file.type }
  });

  return c.json({ success: true, avatarUrl, storagePath });
}

/**
 * DELETE /api/avatar — remove avatar, reset to preset
 */
avatarRouter.delete('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const token = c.get('authToken');

  const adminSupabase = getAdminSupabaseClient();
  if (!adminSupabase) return c.json({ error: 'Storage service unconfigured.' }, 503);

  // List user's avatar files
  const { data: files } = await adminSupabase.storage
    .from('avatars')
    .list(authUser.id);

  if (files && files.length > 0) {
    const paths = files.map(f => `${authUser.id}/${f.name}`);
    await adminSupabase.storage.from('avatars').remove(paths);
  }

  // Clear avatar_url from profile
  const userSupabase = getUserSupabaseClient(token);
  if (userSupabase) {
    await userSupabase
      .from('voxel_users')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', authUser.id);
  }

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'avatar.deleted',
    resource: 'storage.avatars'
  });

  return c.json({ success: true });
});
