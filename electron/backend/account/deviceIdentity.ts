import { app, safeStorage } from 'electron';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface StoredIdentity { publicKey: string; privateKey: string; }
const fileName = 'voxelplus-device-identity.bin';

function filePath() { return path.join(app.getPath('userData'), fileName); }
function load(): StoredIdentity | null {
  if (!existsSync(filePath()) || !safeStorage.isEncryptionAvailable()) return null;
  try { return JSON.parse(safeStorage.decryptString(readFileSync(filePath()))) as StoredIdentity; } catch { return null; }
}
function save(identity: StoredIdentity) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.');
  const encrypted = safeStorage.encryptString(JSON.stringify(identity));
  writeFileSync(filePath(), encrypted, { mode: 0o600 });
}

export function createDeviceIdentity(): { publicKey: string; publicKeyId: string } {
  const existing = load(); if (existing) return { publicKey: existing.publicKey, publicKeyId: publicKeyId(existing.publicKey) };
  const pair = generateKeyPairSync('ed25519');
  const identity = {
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
  };
  save(identity);
  return { publicKey: identity.publicKey, publicKeyId: publicKeyId(identity.publicKey) };
}
export function getDeviceIdentityStatus() { const identity = load(); return { exists: !!identity, publicKeyId: identity ? publicKeyId(identity.publicKey) : null }; }
export function publicKeyId(publicKey: string) { return createHash('sha256').update(publicKey, 'utf8').digest('hex'); }
export function signChallenge(challenge: string): string {
  const identity = load(); if (!identity) throw new Error('Device identity has not been created.');
  return sign(null, Buffer.from(challenge, 'utf8'), { key: Buffer.from(identity.privateKey, 'base64'), format: 'der', type: 'pkcs8' }).toString('base64');
}
