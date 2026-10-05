import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getDataClient } from '../store.js';
import { logAuditEventServer } from '../audit.js';
import { evaluateAchievements } from '../achievementEngine.js';

export const profileRouter = new Hono<CloudApiEnv>();

// Authenticated Get Current Profile Endpoint
profileRouter.get('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const db = getDataClient();

  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  const { data, error } = await (db as any)
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
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { username, avatar, bio, isPublic, syncEnabled } = body;

  const db = getDataClient();
  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }
  const now = new Date().toISOString();

  // Username IS the identity — validate format + uniqueness, then update the
  // canonical credential row and profile together.
  if (username && username.trim().toLowerCase() !== authUser.username.toLowerCase()) {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      return c.json({ error: 'Username must be 3-20 characters, letters, numbers, or underscores only.' }, 400);
    }
    const { data: taken } = await (db as any)
      .from('voxel_accounts')
      .select('id, username')
      .ilike('username', username.trim())
      .maybeSingle();
    if (taken && String(taken.username).toLowerCase() === username.trim().toLowerCase() && taken.id !== authUser.id) {
      return c.json({ error: `Username "${username}" is already taken.`, code: 'USERNAME_TAKEN' }, 409);
    }
    const { error: credErr } = await (db as any)
      .from('voxel_accounts')
      .update({ username: username.trim() })
      .eq('id', authUser.id);
    if (credErr) {
      return c.json({ error: `Failed to update account username: ${credErr.message}`, code: 'USERNAME_UPDATE_FAILED' }, 400);
    }
    authUser.username = username.trim();
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

  const { data, error } = await (db as any)
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
    try {
      const { data: files } = await (db as any).storage.from('avatars').list(authUser.id);
      if (files && files.length > 0) {
        const { error: rmErr } = await (db as any).storage
          .from('avatars')
          .remove(files.map((f: any) => `${authUser.id}/${f.name}`));
        if (rmErr) console.warn('[CloudAPI Profile] Avatar file cleanup failed:', rmErr.message);
      }
    } catch (e: any) {
      console.warn('[CloudAPI Profile] Avatar file cleanup failed:', e?.message);
    }
  }

  // Profile state changed (e.g. is_public) — re-evaluate achievements.
  await evaluateAchievements(db, authUser.id);

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
