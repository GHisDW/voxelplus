import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getDataStore } from '../store.js';
import { logAuditEventServer } from '../audit.js';
import { evaluateAchievements } from '../achievementEngine.js';

export const avatarRouter = new Hono<CloudApiEnv>();
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAGIC_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }
];

function sniffImageMime(buf: Buffer): string | null {
  for (const signature of MAGIC_SIGNATURES) {
    if (buf.length < signature.bytes.length) continue;
    if (!signature.bytes.every((byte, index) => buf[index] === byte)) continue;
    if (signature.mime === 'image/webp' && (buf.length < 12 || buf.toString('ascii', 8, 12) !== 'WEBP')) continue;
    return signature.mime;
  }
  return null;
}

avatarRouter.post('/', authMiddleware, handleAvatarUpload);
avatarRouter.post('/upload', authMiddleware, handleAvatarUpload);

async function handleAvatarUpload(c: any) {
  const authUser = c.get('authUser');
  let formData: FormData;
  try { formData = await c.req.formData(); } catch { return c.json({ error: 'Expected multipart/form-data with an image file.' }, 400); }
  const file = formData.get('avatar') as File | null;
  if (!file || !(file instanceof File)) return c.json({ error: 'No file uploaded. Include "avatar" field in form data.' }, 400);
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return c.json({ error: 'Unsupported image type.', code: 'INVALID_MIME_TYPE' }, 415);
  if (file.size > MAX_AVATAR_SIZE_BYTES) return c.json({ error: 'Avatar file too large. Maximum size is 2 MB.', code: 'FILE_TOO_LARGE' }, 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffImageMime(buffer) !== file.type) return c.json({ error: 'Uploaded content is not a valid image of the declared type.', code: 'INVALID_IMAGE_CONTENT' }, 415);

  // Avatars are kept in the application datastore as a bounded data URL. This
  // avoids a hidden provider-specific object store and keeps local/production
  // behavior identical. A future blob provider can be added behind DataStore.
  const avatarUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
  const db = getDataStore();
  const { error } = await db.table('voxel_users').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', authUser.id);
  if (error) return c.json({ error: `Failed to attach avatar: ${error.message}` }, 500);
  await logAuditEventServer({ actor_id: authUser.id, actor_type: 'user', action: 'avatar.uploaded', resource: 'voxel_users', details: { sizeBytes: file.size, mimeType: file.type } });
  await evaluateAchievements(db, authUser.id);
  return c.json({ success: true, avatarUrl });
}

avatarRouter.delete('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const db = getDataStore();
  const { error } = await db.table('voxel_users').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', authUser.id);
  if (error) return c.json({ error: `Failed to clear avatar: ${error.message}` }, 500);
  await logAuditEventServer({ actor_id: authUser.id, actor_type: 'user', action: 'avatar.deleted', resource: 'voxel_users' });
  return c.json({ success: true });
});
