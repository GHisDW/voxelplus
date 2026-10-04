import { Context, Next } from 'hono';

interface RateLimitStore {
  count: number;
  resetAt: number;
}

const ipLimits = new Map<string, RateLimitStore>();
const userLimits = new Map<string, RateLimitStore>();

export function rateLimitMiddleware(options: { windowMs?: number; maxRequests?: number } = {}) {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute
  const maxRequests = options.maxRequests || 60;

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const now = Date.now();

    let entry = ipLimits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      ipLimits.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      return c.json({ error: 'Rate limit exceeded. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' }, 429);
    }

    const authUser = c.get('authUser');
    if (authUser && authUser.id) {
      let userEntry = userLimits.get(authUser.id);
      if (!userEntry || now > userEntry.resetAt) {
        userEntry = { count: 0, resetAt: now + windowMs };
        userLimits.set(authUser.id, userEntry);
      }
      userEntry.count += 1;
      if (userEntry.count > maxRequests) {
        return c.json({ error: 'User rate limit exceeded.', code: 'RATE_LIMIT_EXCEEDED' }, 429);
      }
    }

    await next();
  };
}
