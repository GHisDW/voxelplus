import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getUserSupabaseClient, getAdminSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';

export const profileRouter = new Hono<CloudApiEnv>();

// Authenticated Get Current Profile Endpoint
profileRouter.get('/', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const userSupabase = getUserSupabaseClient(token);

  if (!userSupabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }

  const { data, error } = await userSupabase
    .from('voxel_users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (error || !data) {
    return c.json({ error: 'Profile not found.' }, 404);
  }

  return c.json({
    id: data.id,
    username: data.username,
    // Canonical avatar: uploaded avatar_url wins over the `avatar` preset.
    avatar: data.avatar_url || data.avatar || 'avatar_steve',
    bio: data.bio || '',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isPublic: data.is_public,
    syncEnabled: true
  });
});

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

  // If username is being changed, validate uniqueness and update canonical Auth identity
  if (username && username.trim().toLowerCase() !== (authUser.user_metadata?.username || '').toLowerCase()) {
    const adminSupabase = getAdminSupabaseClient();
    if (adminSupabase) {
      const newEmail = `${username.trim().toLowerCase()}@voxel.internal`;
      const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(authUser.id, {
        email: newEmail,
        user_metadata: { username: username.trim() }
      });

      if (authUpdateError) {
        return c.json({
          error: `Failed to update cloud authentication identity: ${authUpdateError.message}`,
          code: 'AUTH_IDENTITY_UPDATE_FAILED'
        }, 400);
      }
    }
  }

  const profileUpdate: Record<string, any> = {
    updated_at: now
  };

  if (username) profileUpdate.username = username.trim();
  if (avatar !== undefined) {
    profileUpdate.avatar = avatar;
    // Choosing a preset avatar makes it the canonical value again — clear
    // the uploaded avatar override and remove its stored files so no stale
    // URL remains.
    profileUpdate.avatar_url = null;
  }
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

  // After a preset switch, remove orphaned uploaded avatar files.
  if (avatar !== undefined) {
    const adminSupabase = getAdminSupabaseClient();
    if (adminSupabase) {
      try {
        const { data: files } = await adminSupabase.storage.from('avatars').list(authUser.id);
        if (files && files.length > 0) {
          const { error: rmErr } = await adminSupabase.storage
            .from('avatars')
            .remove(files.map(f => `${authUser.id}/${f.name}`));
          if (rmErr) console.warn('[CloudAPI Profile] Avatar file cleanup failed:', rmErr.message);
        }
      } catch (e: any) {
        console.warn('[CloudAPI Profile] Avatar file cleanup failed:', e?.message);
      }
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
    avatar: data.avatar_url || data.avatar,
    bio: data.bio || '',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isPublic: data.is_public,
    syncEnabled: syncEnabled !== undefined ? syncEnabled : true
  });
});
