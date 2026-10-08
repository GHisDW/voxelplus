import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required; production setup cannot continue.');
const pool = new pg.Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true } });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(readFileSync(resolve(process.cwd(), 'schema', 'postgres.sql'), 'utf8'));
    const required = ['voxel_accounts', 'voxel_users', 'voxel_sessions', 'voxel_auth_challenges', 'voxel_audit_events', 'voxel_achievement_reward_queue'];
    const result = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])', ['public', required]);
    const present = new Set(result.rows.map(row => row.table_name));
    const missing = required.filter(name => !present.has(name));
    if (missing.length) throw new Error(`Production schema verification failed; missing tables: ${missing.join(', ')}`);
    const indexes = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('voxel_accounts_public_key_idx','voxel_accounts_username_idx','voxel_sessions_user_idx')");
    if (indexes.rowCount !== 3) throw new Error('Production schema verification failed; required indexes are missing.');
    await client.query('COMMIT');
    console.log(`Production schema verified (${required.length} required tables, ${indexes.rowCount} required indexes).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
