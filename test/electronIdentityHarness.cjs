const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { createPublicKey, verify } = require('node:crypto');

app.commandLine.appendSwitch('no-sandbox');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'voxelplus-device-test-'));
app.setPath('userData', userData);

async function main() {
  await app.whenReady();
  assert.equal(safeStorage.isEncryptionAvailable(), true, 'Windows secure storage must be available');
  const identity = require('../dist-electron/backend/account/deviceIdentity.js');
  const first = identity.createDeviceIdentity();
  const second = identity.createDeviceIdentity();
  assert.deepEqual(second, first, 'identity must survive a second load');
  assert.deepEqual(identity.getDeviceIdentityStatus(), { exists: true, publicKeyId: first.publicKeyId });

  const signature = identity.signChallenge('device-test-challenge');
  assert.equal(verify(null, Buffer.from('device-test-challenge'), createPublicKey({ key: Buffer.from(first.publicKey, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64')), true);

  const storedPath = path.join(userData, 'voxelplus-device-identity.bin');
  const stored = fs.readFileSync(storedPath);
  assert.throws(() => JSON.parse(stored.toString('utf8')), 'private key must not be plaintext JSON');
  const decrypted = JSON.parse(safeStorage.decryptString(stored));
  assert.equal(typeof decrypted.privateKey, 'string');
  assert.equal(stored.toString('utf8').includes(decrypted.privateKey), false);
  assert.equal(globalThis.privateKey, undefined, 'private key must not be placed in renderer-like global state');
  fs.rmSync(userData, { recursive: true, force: true });
  app.exit(0);
}

main().catch((error) => { console.error(error.message); app.exit(1); });
