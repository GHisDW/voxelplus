import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { rateLimitMiddleware } from './rateLimit.js';
import { accountRouter } from './routes/account.js';
import { profileRouter } from './routes/profile.js';
import { libraryRouter } from './routes/library.js';
import { syncRouter } from './routes/sync.js';
import { publicRouter } from './routes/public.js';

const app = new Hono();

app.use('*', rateLimitMiddleware({ windowMs: 60 * 1000, maxRequests: 100 }));

app.get('/health', (c) => c.json({ status: 'ok', service: 'Voxel+ Cloud API' }));

app.route('/api/account', accountRouter);
app.route('/api/profile', profileRouter);
app.route('/api/library', libraryRouter);
app.route('/api/sync', syncRouter);
app.route('/api/public', publicRouter);

if (process.env.START_SERVER === 'true') {
  const port = Number(process.env.PORT) || 3001;
  console.log(`[Cloud API] Server running on port ${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
