import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { DataClient } from './store.js';

/**
 * Voxel+ identity layer — username + password accounts.
 *
 * There is no email anywhere in the account model: the user-facing identity
 * is the Voxel+ username, credentials are scrypt hashes in `voxel_accounts`,
 * and sessions are opaque 256-bit tokens stored SHA-256-hashed in
 * `voxel_sessions`. This file is the ONLY place credentials, sessions and
 * account creation live — routes never touch `voxel_accounts` directly.
 *
 * Backed by the DataClient, so it works identically against production
 * Supabase Postgres and the in-memory dev backend.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYPT_KEYLEN = 64;
// scrypt parameters: N=2^15, r=8, p=1 — interactive-login cost.
// N*r*128B needs ~33MB; Node's default scrypt maxmem is 32MB, so raise it.
const SCRYPT_OPTS = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

function scryptHash(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptHash(password, salt);
  return `scrypt$${SCRYPT_OPTS.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, nStr, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scryptHash(password, salt);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface VoxelSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface IdentityUser {
  id: string;
  username: string;
}

/** Case-insensitive username lookup. Returns the account row or null. */
export async function findAccountByUsername(
  db: DataClient,
  username: string
): Promise<{ id: string; username: string; password_hash: string } | null> {
  const { data } = await (db as any)
    .from('voxel_accounts')
    .select('id, username, password_hash')
    .ilike('username', username)
    .maybeSingle();
  // ilike matches substrings too — enforce exact (case-insensitive) match.
  if (!data || String(data.username).toLowerCase() !== username.toLowerCase()) return null;
  return data as any;
}

export async function findAccountById(db: DataClient, userId: string): Promise<IdentityUser | null> {
  const { data } = await (db as any)
    .from('voxel_accounts')
    .select('id, username')
    .eq('id', userId)
    .maybeSingle();
  return (data as IdentityUser | null) ?? null;
}

export async function createAccount(
  db: DataClient,
  username: string,
  password: string
): Promise<{ userId: string | null; error: string | null }> {
  const password_hash = await hashPassword(password);
  const { data, error } = await (db as any)
    .from('voxel_accounts')
    .insert({ id: randomUUID(), username: username.trim(), password_hash, created_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error) {
    // Unique violation → duplicate username (also caught by pre-check).
    if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
      return { userId: null, error: 'USERNAME_TAKEN' };
    }
    return { userId: null, error: error.message };
  }
  return { userId: data?.id ?? null, error: data?.id ? null : 'account row missing id' };
}

export async function verifyCredentials(
  db: DataClient,
  username: string,
  password: string
): Promise<IdentityUser | null> {
  const account = await findAccountByUsername(db, username);
  if (!account) return null;
  const ok = await verifyPassword(password, account.password_hash);
  return ok ? { id: account.id, username: account.username } : null;
}

export async function issueSession(db: DataClient, userId: string): Promise<VoxelSession | { error: string }> {
  const accessToken = randomBytes(32).toString('base64url');
  const refreshToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error } = await (db as any).from('voxel_sessions').insert({
    id: randomUUID(),
    user_id: userId,
    token_hash: hashToken(accessToken),
    refresh_hash: hashToken(refreshToken),
    expires_at: expiresAt,
    created_at: new Date().toISOString()
  });
  if (error) return { error: error.message };
  return { accessToken, refreshToken, expiresAt };
}

/**
 * Resolves a Bearer access token to an identity. Checks the session exists
 * and is not expired — fail-closed on any lookup error.
 */
export async function resolveSession(db: DataClient, token: string): Promise<IdentityUser | null> {
  const { data, error } = await (db as any)
    .from('voxel_sessions')
    .select('user_id, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return findAccountById(db, data.user_id);
}

/** Exchanges a refresh token for a new session pair (rotates the session). */
export async function refreshSession(db: DataClient, refreshToken: string): Promise<VoxelSession | { error: string } | null> {
  const { data, error } = await (db as any)
    .from('voxel_sessions')
    .select('id, user_id, expires_at')
    .eq('refresh_hash', hashToken(refreshToken))
    .maybeSingle();
  if (error || !data) return null;
  // Refresh tokens share the session expiry.
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  await (db as any).from('voxel_sessions').delete().eq('id', data.id);
  return issueSession(db, data.user_id);
}

export async function revokeSessionByToken(db: DataClient, token: string): Promise<void> {
  await (db as any).from('voxel_sessions').delete().eq('token_hash', hashToken(token));
}

export async function revokeAllSessions(db: DataClient, userId: string): Promise<void> {
  await (db as any).from('voxel_sessions').delete().eq('user_id', userId);
}

/**
 * Password change: rehash + revoke every OTHER session (the caller's
 * session stays valid — it's still a legitimate authenticated request).
 */
export async function changePassword(
  db: DataClient,
  userId: string,
  newPassword: string,
  keepToken?: string
): Promise<{ error: string | null }> {
  const password_hash = await hashPassword(newPassword);
  const { error } = await (db as any)
    .from('voxel_accounts')
    .update({ password_hash })
    .eq('id', userId);
  if (error) return { error: error.message };

  const { data: sessions } = await (db as any)
    .from('voxel_sessions')
    .select('id, token_hash')
    .eq('user_id', userId);
  const keep = keepToken ? hashToken(keepToken) : null;
  for (const s of sessions || []) {
    if (s.token_hash !== keep) {
      await (db as any).from('voxel_sessions').delete().eq('id', s.id);
    }
  }
  return { error: null };
}
