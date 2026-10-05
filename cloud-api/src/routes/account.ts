import { Hono } from 'hono';
import { getPublicSupabaseClient, getAdminSupabaseClient, getUserSupabaseClient } from '../supabase.js';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { logAuditEventServer, checkIpCreationLimit } from '../audit.js';
import { runTrackedDeletion } from '../deletion.js';
import { performSignup } from '../signup.js';

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

  // The service-role client is REQUIRED before any Auth user is created:
  // it is needed for both the voxel_users profile row and orphan
  // compensation. Refusing the signup up front guarantees no Auth identity
  // can ever be created that we cannot complete or roll back — there is no
  // code path where "auth signup succeeded + admin client unavailable"
  // leaves an orphaned account.
  const adminSupabase = getAdminSupabaseClient();

  // Check username uniqueness before signup
  const { data: existingUser } = await supabase
    .from('voxel_users')
    .select('username')
    .ilike('username', username.trim())
    .maybeSingle();

  if (existingUser) {
    return c.json({ error: `Username "${username}" is already taken. Please choose a different username.` }, 409);
  }

  // 1–3. Auth signup → profile creation (service-role) → session. See
  // performSignup for the ordering guarantees — an Auth identity is only
  // ever created when the admin client needed to complete or roll back is
  // already available.
  const outcome = await performSignup(supabase, adminSupabase, {
    internalEmail,
    password,
    username,
    avatar,
    bio,
    isPublic
  });

  switch (outcome.kind) {
    case 'admin_unavailable':
      return c.json({ error: 'Cloud service unconfigured.' }, 503);
    case 'signup_failed':
      return c.json({ error: outcome.error }, 400);
    case 'orphaned':
      console.error(`[CloudAPI Signup] Orphan cleanup FAILED for ${outcome.userId}:`, outcome.error);
      return c.json({
        error: `Account creation failed and cleanup of the orphaned account also failed (${outcome.error}). Please contact support.`,
        code: 'ORPHANED_ACCOUNT',
        orphanedUserId: outcome.userId
      }, 500);
    case 'rolled_back':
      return c.json({
        error: `Account creation failed (${outcome.error}). The incomplete account was rolled back — please try signing up again.`,
        code: 'SIGNUP_ROLLED_BACK'
      }, 500);
    case 'session_failed':
      return c.json({
        error: 'Account created, but an authenticated session could not be established. Please log in with your credentials.',
        code: 'SESSION_ESTABLISHMENT_FAILED'
      }, 400);
  }

  const { userId } = outcome;
  const now = outcome.createdAt;

  await logAuditEventServer({
    actor_id: userId,
    actor_type: 'user',
    action: 'account.create',
    resource: 'voxel_users',
    details: { username, isPublic }
  });

  return c.json({
    userId,
    accessToken: outcome.accessToken,
    refreshToken: outcome.refreshToken,
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
    avatar: profileRow?.avatar_url || profileRow?.avatar || 'avatar_steve',
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

  // Tracked, resumable deletion. If durable deletion state cannot be read
  // or written, no destructive step runs — the request fails closed.
  try {
    const outcome = await runTrackedDeletion(adminSupabase, userId);

    switch (outcome.kind) {
      case 'already_complete':
        return c.json({ success: true, userId, alreadyDeleted: true });
      case 'queue_unavailable':
        return c.json({ error: outcome.error, code: 'DELETION_STATE_UNAVAILABLE' }, 503);
      case 'unpersisted':
        return c.json({
          error: outcome.error,
          code: 'DELETION_STATE_UNPERSISTED',
          retryable: true
        }, 500);
      case 'incomplete':
        await logAuditEventServer({
          actor_id: userId,
          actor_type: 'user',
          action: 'account.delete',
          resource: 'voxel_users',
          details: { userId, failedStep: outcome.step }
        });
        return c.json({
          error: `Account deletion incomplete at step "${outcome.step}": ${outcome.error}. The request can be retried.`,
          code: 'DELETION_INCOMPLETE',
          failedStep: outcome.step,
          retryable: true
        }, 500);
    }

    await logAuditEventServer({
      actor_id: userId,
      actor_type: 'user',
      action: 'account.delete',
      resource: 'voxel_users',
      details: { userId }
    });

    return c.json({ success: true, userId });
  } catch (err: any) {
    return c.json({ error: err.message || 'Account deletion failed.' }, 500);
  }
});
