import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getUserSupabaseClient, getAdminSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';

export const profileRouter = new Hono<CloudApiEnv>();

profileRouter.put('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { username, avatar, bio, isPublic, syncEnabled } = body;

  const userSupabase = getUserSupabaseClient(token);
  if (!userSupabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }
  const now = new Date().toISOString();

  const profileUpdate: Record<string, any> = {
    updated_at: now
  };

  if (username) profileUpdate.username = username.trim();
  if (avatar !== undefined) profileUpdate.avatar = avatar;
  if (bio !== undefined) profileUpdate.bio = bio.trim();
  if (isPublic !== undefined) profileUpdate.is_public = isPublic;

  const { data, error } = await userSupabase
    .from('voxel_users')
    .update(profileUpdate)
    .eq('id', authUser.id)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  // If username was updated, update canonical Supabase email using admin client
  if (username && username.trim().toLowerCase() !== (authUser.user_metadata?.username || '').toLowerCase()) {
    try {
      const adminSupabase = getAdminSupabaseClient();
      if (adminSupabase) {
        const newEmail = `${username.trim().toLowerCase()}@voxel.internal`;
        await adminSupabase.auth.admin.updateUserById(authUser.id, {
          email: newEmail,
          user_metadata: { username }
        });
      }
    } catch (e) {
      console.warn('[CloudAPI Profile] Email update error:', e);
    }
  }

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'profile.update',
    resource: 'voxel_users',
    details: { username: data.username, isPublic: data.is_public }
  });

  return c.json({
    id: data.id,
    username: data.username,
    avatar: data.avatar,
    bio: data.bio || '',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isPublic: data.is_public,
    syncEnabled: syncEnabled !== undefined ? syncEnabled : true
  });
});
