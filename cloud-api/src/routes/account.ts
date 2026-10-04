import { Hono } from 'hono';
import { getPublicSupabaseClient, getAdminSupabaseClient, getUserSupabaseClient } from '../supabase.js';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { logAuditEventServer, checkIpCreationLimit } from '../audit.js';

export const accountRouter = new Hono<CloudApiEnv>();

// Unauthenticated Signup Endpoint
accountRouter.post('/signup', async (c) => {
  const body = await c.req.json();
  const { username, password, avatar, bio, isPublic } = body;

  if (!username || !password) {
    return c.json({ error: 'Username and password are required.' }, 400);
  }

  // Username format validation
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return c.json({ error: 'Username must be 3-20 characters, letters, numbers, or underscores only.' }, 400);
  }

  if (typeof password !== 'string' || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters.' }, 400);
  }

  // TenantScale: IP-based account creation rate limit (max 5 per hour per IP)
  const clientIp =
    c.req.header('x-forwarded-for') ||
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    '127.0.0.1';
  const ipGuard = checkIpCreationLimit(clientIp);
  if (ipGuard.blocked) {
    return c.json({
      error: 'Too many account creation attempts from this IP address. Please try again later.',
      code: 'IP_RATE_LIMIT_EXCEEDED'
    }, 429);
  }

  const internalEmail = `${username.trim().toLowerCase()}@voxel.internal`;
  const supabase = getPublicSupabaseClient();
  if (!supabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }

  // Check username uniqueness before signup
  const { data: existingUser } = await supabase
    .from('voxel_users')
    .select('username')
    .ilike('username', username.trim())
    .maybeSingle();

  if (existingUser) {
    return c.json({ error: `Username "${username}" is already taken. Please choose a different username.` }, 409);
  }

  // 1. Sign up user via Supabase Auth
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

  let sessionData = data.session;

  // 2. If email confirmation is enabled on Supabase project, sign in immediately with admin privileges or auto-login
  if (!sessionData) {
    const adminSupabase = getAdminSupabaseClient();
    if (adminSupabase) {
      await adminSupabase.auth.admin.updateUserById(data.user.id, { email_confirm: true });
    }
    const signInRes = await supabase.auth.signInWithPassword({
      email: internalEmail,
      password
    });
    sessionData = signInRes.data.session;
  }

  if (!sessionData || !sessionData.access_token) {
    return c.json({
      error: 'Account created, but an authenticated session could not be established. Please log in with your credentials.',
      code: 'SESSION_ESTABLISHMENT_FAILED'
    }, 400);
  }

  const userId = data.user.id;
  const now = new Date().toISOString();

  // 3. Create voxel_users profile
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
    accessToken: sessionData.access_token,
    refreshToken: sessionData.refresh_token,
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

// Unauthenticated Login Endpoint
accountRouter.post('/login', async (c) => {
  const body = await c.req.json();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: 'Username and password are required.' }, 400);
  }

  const internalEmail = `${username.trim().toLowerCase()}@voxel.internal`;
  const supabase = getPublicSupabaseClient();
  if (!supabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password
  });

  if (error || !data.user || !data.session) {
    return c.json({ error: error?.message || 'Invalid username or password.' }, 401);
  }

  const userId = data.user.id;

  const { data: profileRow } = await supabase
    .from('voxel_users')
    .select('*')
    .eq('id', userId)
    .single();

  const profile = {
    id: userId,
    username: profileRow?.username || username,
    avatar: profileRow?.avatar || 'avatar_steve',
    bio: profileRow?.bio || '',
    createdAt: profileRow?.created_at || new Date().toISOString(),
    updatedAt: profileRow?.updated_at || new Date().toISOString(),
    isPublic: profileRow?.is_public !== undefined ? profileRow.is_public : true,
    syncEnabled: true
  };

  await logAuditEventServer({
    actor_id: userId,
    actor_type: 'user',
    action: 'account.login',
    resource: 'voxel_users',
    details: { username }
  });

  return c.json({
    userId,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    profile
  });
});

// Authenticated Password Change Endpoint
accountRouter.post('/password', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { newPassword } = body;

  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: 'New password must be at least 6 characters.' }, 400);
  }

  const supabase = getUserSupabaseClient(token);
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
