import { Hono } from 'hono';
import { getPublicSupabaseClient, getAdminSupabaseClient } from '../supabase.js';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { logAuditEventServer } from '../audit.js';

export const accountRouter = new Hono<CloudApiEnv>();

// Unauthenticated Signup Endpoint
accountRouter.post('/signup', async (c) => {
  const body = await c.req.json();
  const { username, password, avatar, bio, isPublic } = body;

  if (!username || !password) {
    return c.json({ error: 'Username and password are required.' }, 400);
  }

  const internalEmail = `${username.trim().toLowerCase()}@voxel.internal`;
  const supabase = getPublicSupabaseClient();
  if (!supabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }

  const { data, error } = await supabase.auth.signUp({
    email: internalEmail,
    password,
    options: {
      data: { username, avatar, bio, isPublic }
    }
  });

  if (error || !data.user) {
    return c.json({ error: error?.message || 'Cloud signup failed.' }, 400);
  }

  const userId = data.user.id;
  const now = new Date().toISOString();

  // Create voxel_users profile
  const { error: profileError } = await supabase.from('voxel_users').upsert({
    id: userId,
    username,
    avatar: avatar || 'avatar_steve',
    bio: bio || '',
    is_public: isPublic !== undefined ? isPublic : true,
    updated_at: now,
    created_at: now
  }, { onConflict: 'id' });

  if (profileError) {
    return c.json({ error: `Profile row creation failed: ${profileError.message}` }, 500);
  }

  await logAuditEventServer({
    actor_id: userId,
    actor_type: 'user',
    action: 'account.create',
    resource: 'voxel_users',
    details: { username, isPublic }
  });

  return c.json({
    userId,
    accessToken: data.session?.access_token || '',
    refreshToken: data.session?.refresh_token || '',
    profile: {
      id: userId,
      username,
      avatar: avatar || 'avatar_steve',
      bio: bio || '',
      createdAt: now,
      updatedAt: now,
      isPublic: isPublic !== undefined ? isPublic : true,
      syncEnabled: true
    }
  });
});

// Authenticated Password Change Endpoint
accountRouter.post('/password', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { newPassword } = body;

  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: 'New password must be at least 6 characters.' }, 400);
  }

  const supabase = getPublicSupabaseClient();
  if (!supabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'account.password_change',
    resource: 'auth.users'
  });

  return c.json({ success: true });
});

// Idempotent Account Deletion Endpoint
accountRouter.delete('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const userId = authUser.id;

  const adminSupabase = getAdminSupabaseClient();
  if (!adminSupabase) {
    return c.json({ error: 'Privileged admin client unconfigured.' }, 503);
  }

  // 1. Log deletion job in queue
  const { data: queueRecord, error: queueErr } = await adminSupabase
    .from('voxel_account_deletion_queue')
    .insert({
      user_id: userId,
      status: 'processing'
    })
    .select('id, status')
    .single();

  if (queueErr && queueErr.code !== '23505') {
    console.warn('[CloudAPI Delete] Queue insert warning:', queueErr.message);
  }

  try {
    await logAuditEventServer({
      actor_id: userId,
      actor_type: 'user',
      action: 'account.delete',
      resource: 'voxel_users',
      details: { userId }
    });

    // 2. Delete cloud resources
    await adminSupabase.from('voxel_cloud_sync').delete().eq('user_id', userId);
    await adminSupabase.from('voxel_library').delete().eq('user_id', userId);
    await adminSupabase.from('voxel_users').delete().eq('id', userId);

    // 3. Delete Supabase Auth User identity
    const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      if (queueRecord?.id) {
        await adminSupabase
          .from('voxel_account_deletion_queue')
          .update({ status: 'failed' })
          .eq('id', queueRecord.id);
      }
      return c.json({ error: `Auth identity deletion failed: ${authDeleteError.message}` }, 500);
    }

    if (queueRecord?.id) {
      await adminSupabase
        .from('voxel_account_deletion_queue')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', queueRecord.id);
    }

    return c.json({ success: true, userId });
  } catch (err: any) {
    if (queueRecord?.id) {
      await adminSupabase
        .from('voxel_account_deletion_queue')
        .update({ status: 'failed' })
        .eq('id', queueRecord.id);
    }
    return c.json({ error: err.message || 'Account deletion failed.' }, 500);
  }
});
