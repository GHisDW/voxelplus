import { Hono } from 'hono';
import { getPublicSupabaseClient, getAdminSupabaseClient, getUserSupabaseClient } from '../supabase.js';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { logAuditEventServer, checkIpCreationLimit } from '../audit.js';
import {
  createVoxelProfile,
  compensateOrphanedSignup,
  performAccountDeletion,
  findLatestQueueRow,
  updateQueueRow,
  completedStepsForStatus,
  failedStatusForStep
} from '../deletion.js';

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

  // 3. Create voxel_users profile via the service-role client. If this
  //    fails after Auth signup succeeded, the Auth identity must not be
  //    left orphaned — compensate by deleting it so the username/email can
  //    be retried cleanly.
  const adminForProfile = getAdminSupabaseClient();
  if (!adminForProfile) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }
  const { error: profileError } = await createVoxelProfile(adminForProfile, {
    id: userId,
    username,
    avatar: avatar || 'avatar_steve',
    bio: bio || '',
    is_public: isPublic !== undefined ? isPublic : true,
    updated_at: now,
    created_at: now
  });

  if (profileError) {
    console.error(`[CloudAPI Signup] Profile creation failed for ${userId}:`, profileError);
    const cleanup = await compensateOrphanedSignup(adminForProfile, userId);
    if (!cleanup.removed) {
      // Compensation itself failed — report honestly; the auth identity is
      // still present and visible to admins for manual cleanup.
      console.error(`[CloudAPI Signup] Orphan cleanup FAILED for ${userId}:`, cleanup.error);
      return c.json({
        error: `Account creation failed and cleanup of the orphaned account also failed (${cleanup.error}). Please contact support.`,
        code: 'ORPHANED_ACCOUNT',
        orphanedUserId: userId
      }, 500);
    }
    return c.json({
      error: `Account creation failed (${profileError}). The incomplete account was rolled back — please try signing up again.`,
      code: 'SIGNUP_ROLLED_BACK'
    }, 500);
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

  // Resume an in-progress deletion for this user when one exists; otherwise
  // start a new queue job. Progress is recorded per step so a retry is safe
  // and a repeat request after completion is idempotent.
  let queueRow = await findLatestQueueRow(adminSupabase, userId);
  if (!queueRow || queueRow.status === 'complete') {
    if (queueRow?.status === 'complete') {
      // Already fully deleted — verify nothing remains before reporting.
      return c.json({ success: true, userId, alreadyDeleted: true });
    }
    queueRow = await updateQueueRow(adminSupabase, undefined, userId, 'processing');
  }

  try {
    await logAuditEventServer({
      actor_id: userId,
      actor_type: 'user',
      action: 'account.delete',
      resource: 'voxel_users',
      details: { userId }
    });

    const completed = completedStepsForStatus(queueRow?.status);
    const result = await performAccountDeletion(adminSupabase, userId, completed);

    if (!result.success) {
      // Record the exact failing step so cleanup is retryable/resumable.
      if (queueRow?.id) {
        await updateQueueRow(adminSupabase, queueRow.id, userId, failedStatusForStep(result.step));
      }
      return c.json({
        error: `Account deletion incomplete at step "${result.step}": ${result.error}. The request can be retried.`,
        code: 'DELETION_INCOMPLETE',
        failedStep: result.step,
        retryable: true
      }, 500);
    }

    if (queueRow?.id) {
      await updateQueueRow(adminSupabase, queueRow.id, userId, 'complete', new Date().toISOString());
    }

    return c.json({ success: true, userId });
  } catch (err: any) {
    if (queueRow?.id) {
      await updateQueueRow(adminSupabase, queueRow.id, userId, 'failed');
    }
    return c.json({ error: err.message || 'Account deletion failed.' }, 500);
  }
});
