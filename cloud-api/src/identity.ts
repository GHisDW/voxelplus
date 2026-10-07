import {
  createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature
} from 'node:crypto';
import type { DataClient } from './store.js';

/** Voxel+ identity is a device-bound Ed25519 public key, never a password. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const AUTH_WINDOW_MS = 60 * 1000;
const AUTH_MAX_ATTEMPTS = 20;
const attempts = new Map<string, { startedAt: number; count: number }>();

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const publicKeyIdFor = (publicKey: string) => createHash('sha256').update(publicKey, 'utf8').digest('hex');

export interface VoxelSession { accessToken: string; refreshToken: string; expiresAt: string; }
export interface IdentityUser { id: string; username: string; publicKeyId: string; }
export interface RegisteredDevice { userId: string; publicKeyId: string; username: string | null; createdAt: string; }

export function normalizeUsername(username: string): string { return username.trim().toLowerCase(); }
export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return 'Username must be 3-20 letters, numbers, or underscores.';
  if (new Set(['admin', 'administrator', 'system', 'voxel', 'voxelplus', 'support', 'moderator']).has(normalizeUsername(username))) return 'That username is reserved.';
  return null;
}
function validPublicKey(publicKey: string): boolean {
  try { return createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' }).asymmetricKeyType === 'ed25519'; } catch { return false; }
}
export function publicKeyId(publicKey: string): string { return publicKeyIdFor(publicKey); }

export function allowAuthenticationAttempt(rateKey: string): boolean {
  const now = Date.now(); const bucket = attempts.get(rateKey);
  if (bucket && now - bucket.startedAt < AUTH_WINDOW_MS) {
    if (bucket.count >= AUTH_MAX_ATTEMPTS) return false;
    bucket.count++;
  } else attempts.set(rateKey, { startedAt: now, count: 1 });
  return true;
}

export async function registerDevice(db: DataClient, publicKey: string, username?: string, profile?: { avatar?: string; bio?: string; isPublic?: boolean }): Promise<{ device: RegisteredDevice | null; error: string | null }> {
  if (!validPublicKey(publicKey)) return { device: null, error: 'INVALID_PUBLIC_KEY' };
  const normalized = username ? normalizeUsername(username) : null;
  if (normalized) { const validation = validateUsername(username!); if (validation) return { device: null, error: validation }; }
  const keyId = publicKeyIdFor(publicKey);
  const existing = await (db as any).from('voxel_accounts').select('id, status, username, username_normalized, created_at').eq('public_key_id', keyId).maybeSingle();
  if (existing.data) {
    if (existing.data.status === 'deleted') return { device: null, error: 'DEVICE_RETIRED' };
    if (normalized && !existing.data.username_normalized) return { device: null, error: 'USERNAME_CLAIM_REQUIRED' };
    if (normalized && existing.data.username_normalized && existing.data.username_normalized !== normalized) return { device: null, error: 'DEVICE_ALREADY_REGISTERED' };
    return { device: { userId: existing.data.id, publicKeyId: keyId, username: existing.data.username, createdAt: existing.data.created_at }, error: null };
  }
  if (normalized) {
    const taken = await (db as any).from('voxel_accounts').select('id').eq('username_normalized', normalized).maybeSingle();
    if (taken.data) return { device: null, error: 'USERNAME_TAKEN' };
  }
  const now = new Date().toISOString();
  const userId = randomUUID();
  const { error } = await (db as any).from('voxel_accounts').insert({ id: userId, public_key: publicKey, public_key_id: keyId, username: normalized, username_normalized: normalized, status: 'active', created_at: now, deleted_at: null });
  if (error) return { device: null, error: /duplicate|unique|23505/i.test(error.message || '') ? 'USERNAME_TAKEN' : error.message };
  if (normalized) {
    const profileWrite = await (db as any).from('voxel_users').upsert({ id: userId, username: normalized, avatar: profile?.avatar || 'avatar_steve', bio: profile?.bio || '', is_public: profile?.isPublic !== false, created_at: now, updated_at: now }, { onConflict: 'id' });
    if (profileWrite.error) return { device: null, error: profileWrite.error.message };
  }
  return { device: { userId, publicKeyId: keyId, username: normalized, createdAt: now }, error: null };
}

export async function findAccountByPublicKeyId(db: DataClient, keyId: string): Promise<IdentityUser | null> {
  const { data, error } = await (db as any).from('voxel_accounts').select('id, username, public_key_id, status').eq('public_key_id', keyId).maybeSingle();
  if (error || !data || data.status !== 'active') return null;
  return { id: data.id, username: data.username || '', publicKeyId: data.public_key_id };
}
export async function findAccountById(db: DataClient, userId: string): Promise<IdentityUser | null> {
  const { data, error } = await (db as any).from('voxel_accounts').select('id, username, public_key_id, status').eq('id', userId).maybeSingle();
  if (error || !data || data.status !== 'active') return null;
  return { id: data.id, username: data.username || '', publicKeyId: data.public_key_id };
}

export async function issueChallenge(db: DataClient, publicKeyIdValue: string, rateKey = publicKeyIdValue) {
  const now = Date.now();
  if (!allowAuthenticationAttempt(rateKey)) return { error: 'RATE_LIMITED' as const };
  const account = await (db as any).from('voxel_accounts').select('id, status').eq('public_key_id', publicKeyIdValue).maybeSingle();
  if (!account.data || account.data.status !== 'active') return { error: 'UNKNOWN_DEVICE' as const };
  const challenge = randomBytes(32).toString('base64url'); const challengeId = randomUUID(); const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString();
  const { error } = await (db as any).from('voxel_auth_challenges').insert({ id: challengeId, public_key_id: publicKeyIdValue, challenge, expires_at: expiresAt, created_at: new Date(now).toISOString(), consumed_at: null });
  return error ? { error: 'CHALLENGE_UNAVAILABLE' as const } : { challengeId, challenge, expiresAt };
}

export async function verifyChallenge(db: DataClient, challengeId: string, publicKeyIdValue: string, signature: string): Promise<IdentityUser | null> {
  const { data: row, error } = await (db as any).from('voxel_auth_challenges').select('*').eq('id', challengeId).maybeSingle();
  if (error || !row || row.public_key_id !== publicKeyIdValue || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  const { data: account, error: accountError } = await (db as any).from('voxel_accounts').select('id, username, public_key, public_key_id, status').eq('public_key_id', publicKeyIdValue).maybeSingle();
  if (accountError || !account || account.status !== 'active') return null;
  let valid = false;
  try { valid = verifySignature(null, Buffer.from(row.challenge, 'utf8'), createPublicKey({ key: Buffer.from(account.public_key, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64')); } catch { valid = false; }
  if (!valid) return null;
  const consumed = await (db as any).from('voxel_auth_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', challengeId).is('consumed_at', null).select('id').maybeSingle();
  if (consumed.error || !consumed.data) return null;
  return { id: account.id, username: account.username || '', publicKeyId: account.public_key_id };
}

export async function issueSession(db: DataClient, userId: string): Promise<VoxelSession | { error: string }> {
  const accessToken = randomBytes(32).toString('base64url'); const refreshToken = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error } = await (db as any).from('voxel_sessions').insert({ id: randomUUID(), user_id: userId, token_hash: hashToken(accessToken), refresh_hash: hashToken(refreshToken), expires_at: expiresAt, created_at: new Date().toISOString() });
  return error ? { error: error.message } : { accessToken, refreshToken, expiresAt };
}
export async function resolveSession(db: DataClient, token: string): Promise<IdentityUser | null> {
  const { data, error } = await (db as any).from('voxel_sessions').select('user_id, expires_at').eq('token_hash', hashToken(token)).maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) return null; return findAccountById(db, data.user_id);
}
export async function refreshSession(db: DataClient, refreshToken: string): Promise<VoxelSession | { error: string } | null> {
  const { data, error } = await (db as any).from('voxel_sessions').select('id, user_id, expires_at').eq('refresh_hash', hashToken(refreshToken)).maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) return null;
  await (db as any).from('voxel_sessions').delete().eq('id', data.id); return issueSession(db, data.user_id);
}
export async function revokeAllSessions(db: DataClient, userId: string) { await (db as any).from('voxel_sessions').delete().eq('user_id', userId); }

export async function grantConfiguredOwner(db: DataClient, user: IdentityUser): Promise<void> {
  const configured = (process.env.VOXELPLUS_OWNER_USERNAMES || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!configured.includes(normalizeUsername(user.username))) return;
  await (db as any).from('voxel_owner_roles').upsert({ user_id: user.id, role: 'owner' }, { onConflict: 'user_id', ignoreDuplicates: true });
}
