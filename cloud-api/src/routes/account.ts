import { Hono } from 'hono';
import { getDataStore } from '../store.js';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { logAuditEventServer } from '../audit.js';
import { runTrackedDeletion } from '../deletion.js';
import { grantConfiguredOwner, issueRegistrationChallenge, issueSession, refreshSession, registerDevice, validateUsername } from '../identity.js';

export const accountRouter = new Hono<CloudApiEnv>();

/** Registration proof challenge. The public key is not persisted as an account until its signature verifies. */
accountRouter.post('/registration-challenge', async (c) => {
  const { publicKey } = await c.req.json().catch(() => ({}));
  if (typeof publicKey !== 'string') return c.json({ error: 'publicKey is required.' }, 400);
  const result = await issueRegistrationChallenge(getDataStore(), publicKey);
  return 'error' in result ? c.json({ error: result.error }, 400) : c.json(result);
});

/** Phase 1 of first launch: prove possession, then create the immutable account. */
accountRouter.post('/register-key', async (c) => {
  const { publicKey, challengeId, signature } = await c.req.json().catch(() => ({}));
  if (typeof publicKey !== 'string' || typeof challengeId !== 'string' || typeof signature !== 'string') return c.json({ error: 'publicKey, challengeId, and signature are required.' }, 400);
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const result = await registerDevice(db, publicKey, undefined, undefined, { challengeId, signature });
  if (result.error) return c.json({ error: result.error, code: result.error }, result.error === 'DEVICE_RETIRED' ? 410 : 400);
  return c.json({ userId: result.device!.userId, publicKeyId: result.device!.publicKeyId, createdAt: result.device!.createdAt, usernameClaimed: !!result.device!.username });
});

/** Registers a device public key and its user-selected public username. */
accountRouter.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { publicKey, username, avatar, bio, isPublic, challengeId, signature } = body as any;
  if (typeof publicKey !== 'string' || typeof username !== 'string' || typeof challengeId !== 'string' || typeof signature !== 'string') return c.json({ error: 'publicKey, username, challengeId, and signature are required.' }, 400);
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const result = await registerDevice(db, publicKey, username, { avatar, bio, isPublic }, { challengeId, signature });
  if (result.error) return c.json({ error: result.error === 'USERNAME_TAKEN' ? 'Username is already taken.' : result.error, code: result.error }, result.error === 'USERNAME_TAKEN' ? 409 : 400);
  const session = await issueSession(db, result.device!.userId);
  if ('error' in session) return c.json({ error: session.error }, 500);
  await grantConfiguredOwner(db, { id: result.device!.userId, username: result.device!.username!, publicKeyId: result.device!.publicKeyId });
  await logAuditEventServer({ actor_id: result.device!.userId, actor_type: 'user', action: 'account.register_device', resource: 'voxel_accounts', details: { username: result.device!.username } });
  return c.json({ userId: result.device!.userId, publicKeyId: result.device!.publicKeyId, ...session, profile: { id: result.device!.userId, username: result.device!.username, avatar: avatar || 'avatar_steve', bio: bio || '', createdAt: result.device!.createdAt, updatedAt: result.device!.createdAt, isPublic: isPublic !== false, syncEnabled: true } });
});

accountRouter.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json().catch(() => ({}));
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const session = refreshToken ? await refreshSession(db, refreshToken) : null;
  return !session || 'error' in session ? c.json({ error: 'Invalid or expired refresh token.', code: 'UNAUTHORIZED' }, 401) : c.json(session);
});

/** Phase 2: authenticate the pending device, then claim its public username. */
accountRouter.post('/claim-username', authMiddleware, async (c) => {
  const { username, avatar, bio, isPublic } = await c.req.json().catch(() => ({}));
  if (typeof username !== 'string') return c.json({ error: 'username is required.' }, 400);
  const validation = validateUsername(username); if (validation) return c.json({ error: validation }, 400);
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const normalized = username.trim().toLowerCase(); const authUser = c.get('authUser');
  const { data: taken } = await (db as any).table('voxel_accounts').select('id').eq('username_normalized', normalized).maybeSingle();
  if (taken && taken.id !== authUser.id) return c.json({ error: 'Username is already taken.', code: 'USERNAME_TAKEN' }, 409);
  const now = new Date().toISOString();
  const accountUpdate = await (db as any).table('voxel_accounts').update({ username: normalized, username_normalized: normalized }).eq('id', authUser.id).eq('status', 'active').select('id').maybeSingle();
  if (accountUpdate.error || !accountUpdate.data) return c.json({ error: 'Device identity is not active.', code: 'UNAUTHORIZED' }, 401);
  const profile = await (db as any).table('voxel_users').upsert({ id: authUser.id, username: normalized, avatar: avatar || 'avatar_steve', bio: bio || '', is_public: isPublic !== false, created_at: now, updated_at: now }, { onConflict: 'id' });
  if (profile.error) return c.json({ error: profile.error.message }, 400);
  await grantConfiguredOwner(db, { id: authUser.id, username: normalized, publicKeyId: '' });
  return c.json({ success: true, profile: { id: authUser.id, username: normalized, avatar: avatar || 'avatar_steve', bio: bio || '', createdAt: now, updatedAt: now, isPublic: isPublic !== false, syncEnabled: true } });
});

accountRouter.delete('/', authMiddleware, async (c) => {
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const userId = c.get('authUser').id;
  const outcome = await runTrackedDeletion(db, userId);
  if (outcome.kind === 'success' || outcome.kind === 'already_complete') { await logAuditEventServer({ actor_id: userId, actor_type: 'user', action: 'account.delete', resource: 'voxel_accounts' }); return c.json({ success: true, userId }); }
  return c.json({ error: outcome.error, code: 'DELETION_INCOMPLETE', retryable: true }, 500);
});

accountRouter.get('/username/validate/:username', async (c) => {
  const username = c.req.param('username'); const validation = validateUsername(username);
  if (validation) return c.json({ available: false, error: validation }, 400);
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const { data } = await (db as any).table('voxel_accounts').select('id').eq('username_normalized', username.toLowerCase()).maybeSingle();
  return c.json({ available: !data });
});
