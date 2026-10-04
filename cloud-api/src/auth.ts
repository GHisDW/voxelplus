import { Context, Next } from 'hono';
import { getPublicSupabaseClient } from './supabase.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  user_metadata?: Record<string, any>;
}

export type CloudApiEnv = {
  Variables: {
    authToken: string;
    authUser: AuthenticatedUser;
    ownerRole?: string;
  };
};

/**
 * Why TenantScale `validateSession()` is NOT used here:
 *
 * The TenantScale SDK's validateSession(jwt) validates the Supabase JWT AND
 * resolves the caller's membership in a TenantScale tenant — it throws for
 * any valid Supabase user that is not a member of the tenant (and is not a
 * super_admin). Voxel+ is a single-tenant B2C product: normal players are
 * Supabase Auth users, not TenantScale tenant members. Routing every request
 * through validateSession would reject every legitimate player, while adding
 * no security benefit — Voxel+ has exactly one implicit tenant.
 *
 * Supabase `auth.getUser(token)` is therefore the correct identity check:
 * it cryptographically validates the JWT against the project and returns the
 * authenticated user, and every downstream query still runs under RLS scoped
 * to auth.uid(). TenantScale remains in use where it genuinely applies:
 * audit logging and IP-based account-creation rate limiting (see audit.ts).
 *
 * The middleware fails closed: missing/malformed header, unconfigured client,
 * invalid/expired token, or a thrown error all deny the request.
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
    const supabase = getPublicSupabaseClient();
    if (!supabase) {
      return c.json({ error: 'Cloud database unconfigured.', code: 'UNAVAILABLE' }, 503);
    }
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: error?.message || 'Invalid or expired session token.', code: 'UNAUTHORIZED' }, 401);
    }

    c.set('authToken', token);
    c.set('authUser', {
      id: user.id,
      email: user.email || '',
      user_metadata: user.user_metadata || {}
    });

    await next();
  } catch (err: any) {
    return c.json({ error: err.message || 'Authentication error.', code: 'UNAUTHORIZED' }, 401);
  }
}
