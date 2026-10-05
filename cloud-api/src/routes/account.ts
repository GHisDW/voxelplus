import { Hono } from 'hono';
import { getDataClient } from '../store.js';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { logAuditEventServer, checkIpCreationLimit } from '../audit.js';
import { runTrackedDeletion } from '../deletion.js';
import { performSignup } from '../signup.js';
import { verifyCredentials, issueSession, refreshSession, changePassword } from '../identity.js';

export const accountRouter = new Hono<CloudApiEnv>();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Unauthenticated Signup Endpoint — username + password, no email.
accountRouter.post('/signup', async (c) => {
  const body = await c.req.json();
  const { username, password, avatar, bio, isPublic } = body;

  if (!username || !password) {
    return c.json({ error: 'Username and password are required.' }, 400);
  }

  if (!USERNAME_RE.test(username)) {
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

  const db = getDataClient();
  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  // Check username uniqueness before creating anything.
  const { data: existingUser } = await (db as any)
    .from('voxel_users')
    .select('username')
    .ilike('username', username.trim())
    .maybeSingle();

  const { data: existingAccount } = await (db as any)
    .from('voxel_accounts')
    .select('username')
    .ilike('username', username.trim())
    .maybeSingle();

  const taken = [existingUser, existingAccount].some(
    r => r && String(r.username).toLowerCase() === username.trim().toLowerCase()
  );
  if (taken) {
    return c.json({ error: `Username "${username}" is already taken. Please choose a different username.` }, 409);
  }

  const outcome = await performSignup(db, { password, username, avatar, bio, isPublic });

  switch (outcome.kind) {
    case 'username_taken':
      return c.json({ error: `Username "${username}" is already taken. Please choose a different username.` }, 409);
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
    resource: 'voxel_accounts',
    details: { username, isPublic },
    ip: clientIp
  });

  return c.json({
    userId,
    accessToken: outcome.accessToken,
    refreshToken: outcome.refreshToken,
    profile: {
      id: userId,
      username: username.trim(),
      avatar: avatar || 'avatar_steve',
      bio: bio || '',
      createdAt: now,
      updatedAt: now,
      isPublic: isPublic !== undefined ? isPublic : true,
      syncEnabled: true
    }
  });
});

// Unauthenticated Login Endpoint — username + password → Voxel+ session.
accountRouter.post('/login', async (c) => {
  const body = await c.req.json();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: 'Username and password are required.' }, 400);
  }

  const db = getDataClient();
  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  const user = await verifyCredentials(db, String(username).trim(), password);
  if (!user) {
    return c.json({ error: 'Invalid username or password.', code: 'UNAUTHORIZED' }, 401);
  }

  const session = await issueSession(db, user.id);
  if ('error' in session) {
    return c.json({ error: 'Failed to establish session.' }, 500);
  }

  // Owner bootstrap: deployment-configured owner usernames get the owner
  // role granted server-side at login (VOXELPLUS_OWNER_USERNAMES env,
  // comma-separated). Role rows still live in voxel_owner_roles — this only
  // seeds the first grant.
  const ownerNames = (process.env.VOXELPLUS_OWNER_USERNAMES || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (ownerNames.includes(user.username.toLowerCase())) {
    await (db as any).from('voxel_owner_roles').upsert(
      { user_id: user.id, role: 'owner' },
      { onConflict: 'user_id,role', ignoreDuplicates: true }
    );
  }

  const { data: profileRow } = await (db as any)
    .from('voxel_users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const profile = {
    id: user.id,
    username: profileRow?.username || user.username,
    avatar: profileRow?.avatar_url || profileRow?.avatar || 'avatar_steve',
    bio: profileRow?.bio || '',
    createdAt: profileRow?.created_at || new Date().toISOString(),
    updatedAt: profileRow?.updated_at || new Date().toISOString(),
    isPublic: profileRow?.is_public !== undefined ? profileRow.is_public : true,
    syncEnabled: true
  };

  await logAuditEventServer({
    actor_id: user.id,
    actor_type: 'user',
    action: 'account.login',
    resource: 'voxel_accounts',
    details: { username: user.username }
  });

  return c.json({
    userId: user.id,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    profile
  });
});

// Refresh session (rotates tokens).
accountRouter.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { refreshToken } = body as any;
  if (!refreshToken) {
    return c.json({ error: 'refreshToken is required.', code: 'UNAUTHORIZED' }, 401);
  }
  const db = getDataClient();
  if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);

  const session = await refreshSession(db, refreshToken);
  if (!session || 'error' in session) {
    return c.json({ error: 'Invalid or expired refresh token.', code: 'UNAUTHORIZED' }, 401);
  }
  return c.json(session);
});

// Authenticated Password Change Endpoint
accountRouter.post('/password', authMiddleware, async (c) => {
  const token = c.get('authToken');
  const authUser = c.get('authUser');
  const body = await c.req.json();
  const { newPassword } = body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return c.json({ error: 'New password must be at least 6 characters.' }, 400);
  }

  const db = getDataClient()!;
  const { error } = await changePassword(db, authUser.id, newPassword, token);
  if (error) {
    return c.json({ error }, 400);
  }

  await logAuditEventServer({
    actor_id: authUser.id,
    actor_type: 'user',
    action: 'account.password_change',
    resource: 'voxel_accounts'
  });

  return c.json({ success: true });
});

// Idempotent Account Deletion Endpoint
accountRouter.delete('/', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const userId = authUser.id;

  const db = getDataClient();
  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  // Tracked, resumable deletion. If durable deletion state cannot be read
  // or written, no destructive step runs — the request fails closed.
  try {
    const outcome = await runTrackedDeletion(db, userId);

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
          resource: 'voxel_accounts',
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
      resource: 'voxel_accounts',
      details: { userId }
    });

    return c.json({ success: true, userId });
  } catch (err: any) {
    return c.json({ error: err.message || 'Account deletion failed.' }, 500);
  }
});
