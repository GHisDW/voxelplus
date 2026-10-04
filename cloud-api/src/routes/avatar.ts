import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getAdminSupabaseClient, getUserSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';

export const avatarRouter = new Hono<CloudApiEnv>();

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/** Magic-byte signatures for the allowed image formats. */
const MAGIC_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] } // RIFF....WEBP
];

function sniffImageMime(buf: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (buf.length < sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[i] !== sig.bytes[i]) { match = false; break; }
    }
    if (match) {
      if (sig.mime === 'image/webp') {
        // Confirm the WEBP fourcc at bytes 8-11.
        if (buf.length < 12 || buf.toString('ascii', 8, 12) !== 'WEBP') continue;
      }
      return sig.mime;
    }
  }
  return null;
}

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

  // Content validation: the declared MIME must match the actual image bytes
  // (the renderer's file.type is client-supplied and not a security boundary).
  const sniffedMime = sniffImageMime(fileBuffer);
  if (!sniffedMime || sniffedMime !== file.type) {
    return c.json({
      error: 'Uploaded content is not a valid image of the declared type.',
      code: 'INVALID_IMAGE_CONTENT'
    }, 415);
  }

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

  // Remove any previous avatar files with different extensions so replacing
  // an avatar never leaves orphaned files behind.
  const { data: existingFiles } = await adminSupabase.storage
    .from('avatars')
    .list(authUser.id);
  if (existingFiles && existingFiles.length > 0) {
    const stale = existingFiles
      .map(f => `${authUser.id}/${f.name}`)
      .filter(p => p !== storagePath);
    if (stale.length > 0) {
      await adminSupabase.storage.from('avatars').remove(stale);
    }
  }

  // Update profile with new avatar_url — the canonical avatar value.
  // A failure here would leave the file uploaded but unlinked; report it
  // instead of pretending the upload succeeded.
  const userSupabase = getUserSupabaseClient(token);
  if (!userSupabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }
  const { error: avatarUpdateError } = await userSupabase
    .from('voxel_users')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', authUser.id);

  if (avatarUpdateError) {
    // Roll back the uploaded file so no orphan remains.
    await adminSupabase.storage.from('avatars').remove([storagePath]);
    return c.json({ error: `Failed to attach avatar to profile: ${avatarUpdateError.message}` }, 500);
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

  // List user's avatar files and remove them — errors are reported, not
  // silently ignored.
  const { data: files, error: listErr } = await adminSupabase.storage
    .from('avatars')
    .list(authUser.id);

  if (listErr) {
    return c.json({ error: `Avatar cleanup failed: ${listErr.message}` }, 500);
  }

  if (files && files.length > 0) {
    const paths = files.map(f => `${authUser.id}/${f.name}`);
    const { error: rmErr } = await adminSupabase.storage.from('avatars').remove(paths);
    if (rmErr) {
      return c.json({ error: `Avatar file deletion failed: ${rmErr.message}` }, 500);
    }
  }

  // Clear avatar_url from profile — restores the preset `avatar` as the
  // canonical value. A failure leaves a stale URL, so report it.
  const userSupabase = getUserSupabaseClient(token);
  if (!userSupabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }
  const { error: clearErr } = await userSupabase
    .from('voxel_users')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', authUser.id);

  if (clearErr) {
    return c.json({ error: `Failed to clear avatar URL: ${clearErr.message}` }, 500);
  }

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'avatar.deleted',
    resource: 'storage.avatars'
  });

  return c.json({ success: true });
});
