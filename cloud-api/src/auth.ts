import { Context, Next } from 'hono';
import { getDataStore } from './store.js';
import { resolveSession } from './identity.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
}

export type CloudApiEnv = {
  Variables: {
    authToken: string;
    authUser: AuthenticatedUser;
    ownerRole?: string;
  };
};

/**
 * Session validation middleware for Voxel+ accounts.
 *
 * Voxel+ uses device-bound cryptographic identities — no provider-specific backend Auth, no email.
 * The Bearer token is an opaque Voxel+ session issued after signature verification; it is
 * resolved server-side against `voxel_sessions` (SHA-256 hashes, expiry
 * enforced). Fails closed on missing/malformed header, unavailable data
 * backend, unknown/expired token, or any thrown error.
 *
 * B2B tenant-session helpers are deliberately not used for identity: Voxel+
 * players are device-bound accounts, not members of a tenant. Ownership and
 * authorization below this layer are enforced by server-side user_id scoping.
 */
export async function authMiddleware(c: Context<CloudApiEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header.', code: 'UNAUTHORIZED' }, 401);
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return c.json({ error: 'Empty access token.', code: 'UNAUTHORIZED' }, 401);
  }

  try {
    const db = getDataStore();
    if (!db) {
      return c.json({ error: 'Data backend unconfigured.', code: 'UNAVAILABLE' }, 503);
    }

    const user = await resolveSession(db, token);
    if (!user) {
      return c.json({ error: 'Invalid or expired session token.', code: 'UNAUTHORIZED' }, 401);
    }

    c.set('authToken', token);
    c.set('authUser', { id: user.id, username: user.username });

    await next();
  } catch (err: any) {
    return c.json({ error: err.message || 'Authentication error.', code: 'UNAUTHORIZED' }, 401);
  }
}
