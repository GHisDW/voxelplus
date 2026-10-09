import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import app from '../src/index.js';
import { _resetDataStoreForTests, getDataStore } from '../src/store.js';
import { publicKeyId } from '../src/identity.js';
import { computeMetrics, evaluateAchievements } from '../src/achievementEngine.js';

process.env.VOXELPLUS_DATA_BACKEND = 'memory';
const privateKeys = new Map<string, any>();
const keys = () => { const pair = generateKeyPairSync('ed25519'); privateKeys.set(encoded(pair.publicKey, 'spki'), pair.privateKey); return pair; };
const encoded = (key: any, type: 'spki' | 'pkcs8') => key.export({ format: 'der', type }).toString('base64');
async function request(path: string, body: any) {
  if (path === '/api/account/register' && body?.publicKey && privateKeys.has(body.publicKey)) {
    const challenge = await json(await app.request('http://test/api/account/registration-challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicKey: body.publicKey }) }));
    body = { ...body, challengeId: challenge.challengeId, signature: sign(null, Buffer.from(challenge.challenge), privateKeys.get(body.publicKey)).toString('base64') };
  }
  return app.request(`http://test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function get(path: string, token?: string) { return app.request(`http://test${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
async function json(res: Response) { return await res.json() as any; }

test.beforeEach(() => { _resetDataStoreForTests(getDataStore()); (getDataStore() as any).reset(); });

test('device registration creates immutable account and public profile', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki');
  const res = await request('/api/account/register', { publicKey: pub, username: 'Alpha_Device', bio: 'hello' });
  assert.equal(res.status, 200); const body = await json(res);
  assert.equal(body.publicKeyId, publicKeyId(pub)); assert.match(body.userId, /^[0-9a-f-]{36}$/); assert.equal(body.profile.username, 'alpha_device');
  const row = await (getDataStore() as any).table('voxel_accounts').select('*').eq('id', body.userId).maybeSingle();
  assert.equal(row.data.password_hash, undefined); assert.equal(row.data.email, undefined); assert.equal(row.data.public_key, pub);
});

test('public-key registration precedes authenticated username claim', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki');
  const registrationChallenge = await json(await request('/api/account/registration-challenge', { publicKey: pub }));
  const pending = await json(await request('/api/account/register-key', { publicKey: pub, challengeId: registrationChallenge.challengeId, signature: sign(null, Buffer.from(registrationChallenge.challenge), pair.privateKey).toString('base64') }));
  assert.equal(pending.usernameClaimed, false);
  const challenge = await json(await request('/api/auth/challenge', { publicKeyId: pending.publicKeyId }));
  const signature = sign(null, Buffer.from(challenge.challenge), pair.privateKey).toString('base64');
  const auth = await json(await request('/api/auth/verify', { challengeId: challenge.challengeId, publicKeyId: pending.publicKeyId, signature }));
  const claim = await app.request('http://test/api/account/claim-username', { method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'claimed_device' }) });
  assert.equal(claim.status, 200);
  const profile = await get('/api/profile', auth.accessToken); assert.equal((await json(profile)).username, 'claimed_device');
});

test('valid signature succeeds and replay, expiry, wrong key, malformed signatures fail', async () => {
  const a = keys(); const pub = encoded(a.publicKey, 'spki'); const id = publicKeyId(pub);
  const reg = await request('/api/account/register', { publicKey: pub, username: 'signed_device' }); assert.equal(reg.status, 200);
  const challengeRes = await request('/api/auth/challenge', { publicKeyId: id }); const challenge = await json(challengeRes);
  const signature = sign(null, Buffer.from(challenge.challenge), a.privateKey).toString('base64');
  const verify = await request('/api/auth/verify', { challengeId: challenge.challengeId, publicKeyId: id, signature }); assert.equal(verify.status, 200);
  const replay = await request('/api/auth/verify', { challengeId: challenge.challengeId, publicKeyId: id, signature }); assert.equal(replay.status, 401);
  const other = keys(); const wrong = sign(null, Buffer.from(challenge.challenge), other.privateKey).toString('base64');
  const ch2 = await json(await request('/api/auth/challenge', { publicKeyId: id }));
  assert.equal((await request('/api/auth/verify', { challengeId: ch2.challengeId, publicKeyId: id, signature: wrong })).status, 401);
  const ch3 = await json(await request('/api/auth/challenge', { publicKeyId: id }));
  assert.equal((await request('/api/auth/verify', { challengeId: ch3.challengeId, publicKeyId: id, signature: 'not-base64-signature' })).status, 401);
});

test('concurrent verification consumes one challenge only once', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki');
  const reg = await json(await request('/api/account/register', { publicKey: pub, username: 'concurrent_device' }));
  const challenge = await json(await request('/api/auth/challenge', { publicKeyId: reg.publicKeyId }));
  const signature = sign(null, Buffer.from(challenge.challenge), pair.privateKey).toString('base64');
  const results = await Promise.all([
    request('/api/auth/verify', { challengeId: challenge.challengeId, publicKeyId: reg.publicKeyId, signature }),
    request('/api/auth/verify', { challengeId: challenge.challengeId, publicKeyId: reg.publicKeyId, signature })
  ]);
  assert.deepEqual(results.map(result => result.status).sort((a, b) => a - b), [200, 401]);
});

test('second key gets a different account and cannot authenticate first account', async () => {
  const a = keys(); const b = keys(); const pubA = encoded(a.publicKey, 'spki'); const pubB = encoded(b.publicKey, 'spki');
  const ra = await json(await request('/api/account/register', { publicKey: pubA, username: 'device_a' }));
  const rb = await json(await request('/api/account/register', { publicKey: pubB, username: 'device_b' }));
  assert.notEqual(ra.userId, rb.userId); assert.notEqual(ra.publicKeyId, rb.publicKeyId);
  const ch = await json(await request('/api/auth/challenge', { publicKeyId: ra.publicKeyId }));
  const sig = sign(null, Buffer.from(ch.challenge), b.privateKey).toString('base64');
  assert.equal((await request('/api/auth/verify', { challengeId: ch.challengeId, publicKeyId: ra.publicKeyId, signature: sig })).status, 401);
});

test('concurrent username registration is race-safe', async () => {
  const first = keys(); const second = keys();
  const results = await Promise.all([
    request('/api/account/register', { publicKey: encoded(first.publicKey, 'spki'), username: 'race_name' }),
    request('/api/account/register', { publicKey: encoded(second.publicKey, 'spki'), username: 'RACE_NAME' })
  ]);
  assert.deepEqual(results.map(result => result.status).sort((a, b) => a - b), [200, 409]);
});

test('username validation rejects malformed and reserved names', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki');
  assert.equal((await request('/api/account/register', { publicKey: pub, username: 'ab' })).status, 400);
  assert.equal((await request('/api/account/register', { publicKey: pub, username: 'admin' })).status, 400);
  assert.equal((await request('/api/account/register', { publicKey: pub, username: 'bad name' })).status, 400);
});

test('deletion tombstones the identity, invalidates sessions, and retires the public key', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki'); const reg = await json(await request('/api/account/register', { publicKey: pub, username: 'deleted_device' }));
  assert.equal((await app.request('http://test/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${reg.accessToken}` } })).status, 200);
  assert.equal((await request('/api/auth/challenge', { publicKeyId: reg.publicKeyId })).status, 401);
  assert.equal((await request('/api/account/register', { publicKey: pub, username: 'deleted_device_again' })).status, 400);
  const row = await (getDataStore() as any).table('voxel_accounts').select('status, deleted_at').eq('id', reg.userId).maybeSingle();
  assert.equal(row.data.status, 'deleted'); assert.ok(row.data.deleted_at);
});

test('disabled identity cannot request authentication', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki'); const reg = await json(await request('/api/account/register', { publicKey: pub, username: 'disabled_device' }));
  await (getDataStore() as any).table('voxel_accounts').update({ status: 'disabled' }).eq('id', reg.userId);
  assert.equal((await request('/api/auth/challenge', { publicKeyId: reg.publicKeyId })).status, 401);
});

test('expired challenges, rate limits, and normal-user admin authorization fail closed', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki'); const reg = await json(await request('/api/account/register', { publicKey: pub, username: 'security_device' }));
  const db = getDataStore() as any;
  const expired = await json(await request('/api/auth/challenge', { publicKeyId: reg.publicKeyId }));
  await db.table('voxel_auth_challenges').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expired.challengeId);
  const expiredSig = sign(null, Buffer.from(expired.challenge), pair.privateKey).toString('base64');
  assert.equal((await request('/api/auth/verify', { challengeId: expired.challengeId, publicKeyId: reg.publicKeyId, signature: expiredSig })).status, 401);
  const statuses: number[] = [];
  for (let i = 0; i < 21; i++) statuses.push((await request('/api/auth/challenge', { publicKeyId: reg.publicKeyId })).status);
  assert.equal(statuses.at(-1), 429);
  assert.equal((await get('/api/owner/users', reg.accessToken)).status, 403);
});

test('public Player Card returns allowlisted public data only', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki'); const reg = await json(await request('/api/account/register', { publicKey: pub, username: 'public_card', bio: 'visible' }));
  const db = getDataStore() as any;
  await db.table('voxel_achievements').insert({ id: 'achievement_public', title: 'Public', icon: '★', rarity: 'common', enabled: true });
  await db.table('voxel_badges').insert({ id: 'badge_public', name: 'Badge', icon: '●', enabled: true });
  await db.table('voxel_titles').insert({ id: 'title_public', name: 'Title', color: '#fff', enabled: true });
  await db.table('voxel_cosmetics').insert({ id: 'cosmetic_public', name: 'Cosmetic', icon: '◆', rarity: 'common', enabled: true });
  await db.table('voxel_user_achievements').insert({ user_id: reg.userId, achievement_id: 'achievement_public', unlocked_at: new Date().toISOString() });
  await db.table('voxel_user_badges').insert({ user_id: reg.userId, badge_id: 'badge_public' });
  await db.table('voxel_user_titles').insert({ user_id: reg.userId, title_id: 'title_public' });
  await db.table('voxel_user_cosmetics').insert({ user_id: reg.userId, cosmetic_id: 'cosmetic_public' });
  const card = await json(await get('/api/public/profiles/public_card'));
  assert.equal(card.username, 'public_card'); assert.equal(card.bio, 'visible');
  assert.equal(card.achievements[0].id, 'achievement_public'); assert.equal(card.badges[0].id, 'badge_public');
  assert.equal(card.titles[0].id, 'title_public'); assert.equal(card.cosmetics[0].id, 'cosmetic_public');
  assert.equal(card.public_key, undefined); assert.equal(card.accessToken, undefined); assert.equal(card.status, undefined);
});

test('admin grants and revokes are server-authorized and audited', async () => {
  const adminPair = keys(); const targetPair = keys();
  const adminPub = encoded(adminPair.publicKey, 'spki'); const targetPub = encoded(targetPair.publicKey, 'spki');
  const admin = await json(await request('/api/account/register', { publicKey: adminPub, username: 'admin_device' }));
  const target = await json(await request('/api/account/register', { publicKey: targetPub, username: 'target_device' }));
  const db = getDataStore() as any;
  await db.table('voxel_owner_roles').insert({ user_id: admin.userId, role: 'admin' });
  await db.table('voxel_achievements').insert({ id: 'achievement_admin', title: 'Admin Achievement', icon: '★', rarity: 'rare', enabled: true });
  await db.table('voxel_badges').insert({ id: 'badge_admin', name: 'Admin Badge', icon: '●', enabled: true });
  await db.table('voxel_titles').insert({ id: 'title_admin', name: 'Admin Title', color: '#fff', enabled: true });
  await db.table('voxel_cosmetics').insert({ id: 'cosmetic_admin', name: 'Admin Cosmetic', icon: '◆', rarity: 'rare', enabled: true });
  const auth = { Authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' };
  const mutate = (kind: string, id: string, method = 'POST') => app.request(`http://test/api/owner/users/${target.userId}/${kind}`, { method, headers: auth, body: JSON.stringify({ [`${kind}Id`]: id }) });
  for (const [kind, id] of [['achievement', 'achievement_admin'], ['badge', 'badge_admin'], ['title', 'title_admin'], ['cosmetic', 'cosmetic_admin']] as const) assert.equal((await mutate(kind, id)).status, 200);
  assert.equal((await db.table('voxel_user_achievements').select('*').eq('user_id', target.userId).maybeSingle()).data.achievement_id, 'achievement_admin');
  assert.equal((await mutate('badge', 'badge_admin', 'DELETE')).status, 200);
  const audit = await db.table('voxel_audit_events').select('*').eq('actor_id', admin.userId);
  assert.ok((audit.data || []).some((row: any) => row.action === 'owner.achievement_granted'));
});

test('normal achievements are evaluated from authoritative counts, not client claims', async () => {
  const pair = keys(); const pub = encoded(pair.publicKey, 'spki'); const reg = await json(await request('/api/account/register', { publicKey: pub, username: 'achievement_device' }));
  const db = getDataStore() as any;
  await db.table('voxel_instances').insert({ id: 'instance_counts', user_id: reg.userId, version: '1.21', mods_count: 3, shaders_count: 2 });
  await db.table('voxel_achievements').insert({ id: 'achievement_count', title: 'Counted', icon: '★', rarity: 'common', enabled: true, condition_type: 'mods_installed', condition_value: 3 });
  assert.equal((await db.table('voxel_instances').select('*').eq('user_id', reg.userId)).data[0].mods_count, 3);
  assert.equal((await computeMetrics(db, reg.userId)).mods_installed, 3);
  const evaluation = await evaluateAchievements(db, reg.userId);
  assert.deepEqual(evaluation.unlocked, ['achievement_count'], JSON.stringify(evaluation));
  const response = await get('/api/achievements', reg.accessToken); assert.equal(response.status, 200);
  const achievements = await json(response); const counted = achievements.find((item: any) => item.id === 'achievement_count');
  assert.equal(counted?.unlocked, true, JSON.stringify(achievements));
  assert.notEqual((await app.request('http://test/api/achievements', { method: 'POST', headers: { Authorization: `Bearer ${reg.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ achievementId: 'achievement_count' }) })).status, 200);
});

test('authenticated session owns writes regardless of client-supplied account identifiers', async () => {
  const first = keys(); const second = keys();
  const a = await json(await request('/api/account/register', { publicKey: encoded(first.publicKey, 'spki'), username: 'owner_a' }));
  const b = await json(await request('/api/account/register', { publicKey: encoded(second.publicKey, 'spki'), username: 'owner_b' }));
  const write = await app.request('http://test/api/library', { method: 'POST', headers: { Authorization: `Bearer ${a.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'A item', type: 'pack', user_id: b.userId, accountId: b.userId }) });
  assert.equal(write.status, 200);
  const stored = await (getDataStore() as any).table('voxel_library').select('*').maybeSingle();
  assert.equal(stored.data.user_id, a.userId);
  assert.deepEqual(await json(await get('/api/library', b.accessToken)), []);
});
