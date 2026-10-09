import { Hono } from 'hono';
import { getDataStore } from '../store.js';
import { allowAuthenticationAttempt, grantConfiguredOwner, issueChallenge, issueSession, verifyChallenge } from '../identity.js';

export const authRouter = new Hono();

authRouter.post('/challenge', async (c) => {
  const { publicKeyId } = await c.req.json().catch(() => ({}));
  if (typeof publicKeyId !== 'string' || !/^[a-f0-9]{64}$/.test(publicKeyId)) return c.json({ error: 'publicKeyId is required.' }, 400);
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const result = await issueChallenge(db, publicKeyId, c.req.header('x-forwarded-for') || publicKeyId);
  if ('error' in result) return c.json({ error: result.error }, result.error === 'RATE_LIMITED' ? 429 : 401);
  return c.json(result);
});

authRouter.post('/verify', async (c) => {
  const { challengeId, publicKeyId, signature } = await c.req.json().catch(() => ({}));
  if (![challengeId, publicKeyId, signature].every(v => typeof v === 'string')) return c.json({ error: 'challengeId, publicKeyId, and signature are required.' }, 400);
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  if (!allowAuthenticationAttempt(c.req.header('x-forwarded-for') || publicKeyId)) return c.json({ error: 'RATE_LIMITED' }, 429);
  const user = await verifyChallenge(db, challengeId, publicKeyId, signature);
  if (!user) return c.json({ error: 'Invalid, expired, consumed, or mismatched challenge.', code: 'UNAUTHORIZED' }, 401);
  await grantConfiguredOwner(db, user);
  const session = await issueSession(db, user.id);
  return 'error' in session ? c.json({ error: session.error }, 500) : c.json({ userId: user.id, publicKeyId: user.publicKeyId, ...session, profile: { id: user.id, username: user.username } });
});
