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
