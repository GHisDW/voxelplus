import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { rateLimitMiddleware } from './rateLimit.js';
import { accountRouter } from './routes/account.js';
import { profileRouter } from './routes/profile.js';
import { libraryRouter } from './routes/library.js';
import { syncRouter } from './routes/sync.js';
import { publicRouter } from './routes/public.js';
import { achievementsRouter } from './routes/achievements.js';
import { cosmeticsRouter } from './routes/cosmetics.js';
import { ownerRouter } from './routes/owner.js';
import { avatarRouter } from './routes/avatar.js';
import { adsRouter } from './routes/ads.js';
import { instancesRouter } from './routes/instances.js';
import { vpacksRouter } from './routes/vpacks.js';
import { authRouter } from './routes/auth.js';

const app = new Hono();

app.use('*', rateLimitMiddleware({ windowMs: 60 * 1000, maxRequests: 100 }));

app.get('/health', (c) => c.json({ status: 'ok', service: 'Voxel+ Cloud API', version: '1.1.0' }));

app.route('/api/account', accountRouter);
app.route('/api/auth', authRouter);
app.route('/auth', authRouter);
app.route('/api/profile', profileRouter);
app.route('/api/library', libraryRouter);
app.route('/api/sync', syncRouter);
app.route('/api/public', publicRouter);
app.route('/api/achievements', achievementsRouter);
app.route('/api/cosmetics', cosmeticsRouter);
app.route('/api/owner', ownerRouter);
app.route('/api/avatar', avatarRouter);
app.route('/api/ads', adsRouter);
app.route('/api/instances', instancesRouter);
app.route('/api/vpacks', vpacksRouter);

if (process.env.START_SERVER === 'true') {
  const port = Number(process.env.PORT) || 3001;
  console.log(`[Cloud API] Server running on port ${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
