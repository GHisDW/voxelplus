import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

const root = mkdtempSync(join(tmpdir(), 'voxelplus-sqlite-'));
process.env.VOXELPLUS_DATA_BACKEND = 'sqlite';
process.env.VOXELPLUS_SQLITE_PATH = join(root, 'voxelplus.sqlite');
const { default: app } = await import('../src/index.js');
const { getDataStore } = await import('../src/store.js');

test.after(async () => { await getDataStore().close?.(); rmSync(root, { recursive: true, force: true }); });

test('fresh local SQLite datastore initializes and supports device registration', async () => {
  const pair = generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const challengeResponse = await app.request('http://local/api/account/registration-challenge', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicKey })
  });
  const challenge = await challengeResponse.json() as any;
  const { sign } = await import('node:crypto');
  const response = await app.request('http://local/api/account/register-key', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicKey, challengeId: challenge.challengeId, signature: sign(null, Buffer.from(challenge.challenge), pair.privateKey).toString('base64') })
  });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.usernameClaimed, false);
  assert.match(body.userId, /^[0-9a-f-]{36}$/);
});
