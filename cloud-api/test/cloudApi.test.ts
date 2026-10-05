// End-to-end tests for the Voxel+ Cloud API running on the in-memory
// development backend — no Supabase Auth, no email, no production secrets.
process.env.VOXELPLUS_DATA_BACKEND = 'memory';

import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../dist/index.js';
import { sharedMemoryClient } from '../dist/memoryStore.js';

const BASE = 'http://localhost';
let ipCounter = 0;
const nextIp = () => `10.99.${Math.floor(ipCounter / 200)}.${ipCounter++ % 200}`;

async function api(method: string, path: string, body?: any, token?: string, ip?: string) {
  const headers: Record<string, string> = { 'x-forwarded-for': ip || nextIp() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await app.fetch(new Request(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  }));
  return { status: res.status, json: await res.json().catch(() => ({})) as any };
}

async function signup(username: string, password = 'secret1', extra: any = {}, ip?: string) {
  return api('POST', '/api/account/signup', { username, password, ...extra }, undefined, ip);
}

async function login(username: string, password: string) {
  return api('POST', '/api/account/login', { username, password });
}

test('Health endpoint', async () => {
  const res = await app.fetch(new Request(`${BASE}/health`));
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.status, 'ok');
  assert.equal(data.service, 'Voxel+ Cloud API');
});

test('Unauthenticated requests are rejected (fail closed)', async () => {
  const protectedRoutes = [
    { url: '/api/library', method: 'GET' },
    { url: '/api/profile', method: 'GET' },
    { url: '/api/sync', method: 'GET' },
    { url: '/api/cosmetics', method: 'GET' },
    { url: '/api/cosmetics/select', method: 'PUT' },
    { url: '/api/achievements', method: 'GET' },
    { url: '/api/ads/progress', method: 'GET' },
    { url: '/api/ads/complete', method: 'POST' },
    { url: '/api/instances', method: 'GET' },
    { url: '/api/instances', method: 'POST' },
    { url: '/api/vpacks', method: 'GET' },
    { url: '/api/vpacks', method: 'POST' },
    { url: '/api/vpacks/convert', method: 'POST' },
    { url: '/api/avatar/upload', method: 'POST' },
    { url: '/api/owner/check', method: 'GET' },
    { url: '/api/owner/users', method: 'GET' },
    { url: '/api/owner/bulk', method: 'DELETE' }
  ];

  for (const route of protectedRoutes) {
    const { status, json } = await api(route.method, route.url);
    assert.equal(status, 401, `Route ${route.method} ${route.url} should be 401`);
    assert.equal(json.code, 'UNAUTHORIZED');
  }
});

test('Invalid bearer token is rejected', async () => {
  const { status, json } = await api('GET', '/api/library', undefined, 'not-a-real-token');
  assert.equal(status, 401);
  assert.equal(json.code, 'UNAUTHORIZED');
});

// ─── Username+password signup (no email anywhere) ───

test('Username signup creates an account and returns a Voxel+ session', async () => {
  const { status, json } = await signup('player_one', 'hunter22');
  assert.equal(status, 200);
  assert.ok(json.userId, 'userId');
  assert.ok(json.accessToken, 'accessToken');
  assert.ok(json.refreshToken, 'refreshToken');
  assert.equal(json.profile.username, 'player_one');
  // No email field anywhere in the account model.
  assert.equal(json.profile.email, undefined);
  assert.equal((json as any).email, undefined);
  // No credential material is ever exposed.
  const accounts = (sharedMemoryClient as any).tables.get('voxel_accounts') || [];
  const row = accounts.find((r: any) => r.username === 'player_one');
  assert.ok(row.password_hash.startsWith('scrypt$'), 'password stored as scrypt hash');
  assert.ok(!row.password_hash.includes('hunter22'), 'hash does not contain the password');
});

test('Duplicate username is rejected (case-insensitive)', async () => {
  await signup('dup_user_1');
  const { status, json } = await signup('DUP_USER_1');
  assert.equal(status, 409);
  assert.ok(String(json.error).toLowerCase().includes('taken'));
});

test('Signup validation: bad username and short password rejected', async () => {
  const badName = await signup('ab');
  assert.equal(badName.status, 400);
  const badChars = await signup('has space!');
  assert.equal(badChars.status, 400);
  const shortPw = await signup('validname', 'x');
  assert.equal(shortPw.status, 400);
});

// ─── Login ───

test('Login issues a session for correct credentials', async () => {
  await signup('login_user');
  const { status, json } = await login('login_user', 'secret1');
  assert.equal(status, 200);
  assert.ok(json.accessToken);
  assert.equal(json.profile.username, 'login_user');
});

test('Login rejects wrong password and unknown username', async () => {
  await signup('login_user2');
  const badPw = await login('login_user2', 'wrongpw');
  assert.equal(badPw.status, 401);
  const noUser = await login('no_such_user', 'whatever1');
  assert.equal(noUser.status, 401);
});

test('Login is case-insensitive on username', async () => {
  await signup('MixedCase_User');
  const { status } = await login('mixedcase_user', 'secret1');
  assert.equal(status, 200);
});

// ─── Authenticated requests ───

test('Authenticated request resolves the session to the right user', async () => {
  const { json } = await signup('auth_user_a');
  const { status, json: profile } = await api('GET', '/api/profile', undefined, json.accessToken);
  assert.equal(status, 200);
  assert.equal(profile.username, 'auth_user_a');
});

test('Session refresh rotates tokens and keeps the old refresh token dead', async () => {
  const { json } = await signup('refresh_user');
  const rotated = await api('POST', '/api/account/refresh', { refreshToken: json.refreshToken });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.json.accessToken);
  // Old refresh token must not work twice.
  const replay = await api('POST', '/api/account/refresh', { refreshToken: json.refreshToken });
  assert.equal(replay.status, 401);
});

// ─── Password change ───

test('Password change: new password works, old fails, other sessions revoked', async () => {
  await signup('pw_change_user');
  const first = await login('pw_change_user', 'secret1');
  const second = await login('pw_change_user', 'secret1');

  const changed = await api('POST', '/api/account/password', { newPassword: 'newpass99' }, first.json.accessToken);
  assert.equal(changed.status, 200);

  // Other session revoked.
  const other = await api('GET', '/api/profile', undefined, second.json.accessToken);
  assert.equal(other.status, 401, 'other session must be revoked after password change');
  // Caller session still works.
  const self = await api('GET', '/api/profile', undefined, first.json.accessToken);
  assert.equal(self.status, 200);

  const oldLogin = await login('pw_change_user', 'secret1');
  assert.equal(oldLogin.status, 401);
  const newLogin = await login('pw_change_user', 'newpass99');
  assert.equal(newLogin.status, 200);
});

// ─── Account deletion ───

test('Account deletion removes the account and invalidates the session', async () => {
  const { json } = await signup('delete_user');
  const del = await api('DELETE', '/api/account', undefined, json.accessToken);
  assert.equal(del.status, 200);

  const afterDelete = await api('GET', '/api/profile', undefined, json.accessToken);
  assert.equal(afterDelete.status, 401);
  const relogin = await login('delete_user', 'secret1');
  assert.equal(relogin.status, 401);
});

// ─── Authorization boundaries ───

test('Users can only see their own library items', async () => {
  const a = await signup('boundary_a');
  const b = await signup('boundary_b');

  await api('POST', '/api/library', { title: 'A-pack', type: 'pack' }, a.json.accessToken);

  const bLibrary = await api('GET', '/api/library', undefined, b.json.accessToken);
  assert.equal(bLibrary.status, 200);
  assert.deepEqual(bLibrary.json, []);

  const aLibrary = await api('GET', '/api/library', undefined, a.json.accessToken);
  assert.equal(aLibrary.json.length, 1);
});

test('Non-owner token cannot reach owner endpoints', async () => {
  const { json } = await signup('regular_user');
  const res = await api('GET', '/api/owner/users', undefined, json.accessToken);
  assert.ok(res.status === 401 || res.status === 403, `got ${res.status}`);
});

test('Client-reported achievement events endpoint is removed', async () => {
  const res = await api('POST', '/api/achievements/event', { eventType: 'ACCOUNT_CREATED' });
  assert.equal(res.status, 404);
});

// ─── Rate limiting ───

test('Signup IP rate limit blocks after 5 accounts per hour', async () => {
  const ip = nextIp();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await signup(`ratelimit_${i}`, 'secret1', {}, ip);
    statuses.push(r.status);
  }
  assert.equal(statuses[5], 429);
  assert.ok(statuses.slice(0, 5).every(s => s === 200), `expected 5 OK signups, got ${statuses}`);
});

// ─── Audit logging ───

test('Signup writes an account.create audit event to voxel_audit_events', async () => {
  const { json } = await signup('audit_user');
  const rows = ((sharedMemoryClient as any).tables.get('voxel_audit_events') || []) as any[];
  const ev = rows.find(r => r.action === 'account.create' && r.actor_id === json.userId);
  assert.ok(ev, 'expected an account.create audit row');
  assert.equal(ev.resource, 'voxel_accounts');
});

// ─── Public/catalog surfaces ───

test('Public cosmetics catalog returns the seeded catalog', async () => {
  const { status, json } = await api('GET', '/api/cosmetics/catalog');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json) && json.length > 0);
});

test('Public achievements catalog returns the seeded catalog', async () => {
  const { status, json } = await api('GET', '/api/achievements/catalog');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json) && json.length > 0);
});

test('Public profiles expose public data only', async () => {
  await signup('public_user', 'secret1', { isPublic: true });
  const list = await api('GET', '/api/public/profiles');
  assert.equal(list.status, 200);
  const entry = list.json.find((p: any) => p.username === 'public_user');
  assert.ok(entry);
  assert.equal(entry.passwordHash, undefined);
  assert.equal(entry.email, undefined);
});

test('Rewarded ads are unavailable without a configured provider', async () => {
  const status = await api('GET', '/api/ads/status');
  assert.equal(status.status, 200);
  assert.equal(status.json.available, false);
  const { json } = await signup('ads_user');
  const complete = await api('POST', '/api/ads/complete', {
    itemKind: 'cosmetic', itemId: 'cosmetic_dirt_block', completionId: 'x', proof: 'y'
  }, json.accessToken);
  assert.equal(complete.status, 503);
});
