import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import { PathManager } from '../dist-electron/backend/storage/paths.js';
import { CryptoUtils } from '../dist-electron/backend/account/cryptoUtils.js';
import { AccountManager } from '../dist-electron/backend/account/accountManager.js';

// Initialize temporary path manager for test isolation
const testDir = path.resolve('.test-tmp');
PathManager.initialize(testDir);

test('CryptoUtils - Username Validation', () => {
  assert.equal(CryptoUtils.validateUsername('valid_user').isValid, true);
  assert.equal(CryptoUtils.validateUsername('v1').isValid, false); // < 3 chars
  assert.equal(CryptoUtils.validateUsername('a'.repeat(21)).isValid, false); // > 20 chars
  assert.equal(CryptoUtils.validateUsername('user@invalid!').isValid, false); // invalid special chars
});

test('CryptoUtils - Password Validation', () => {
  assert.equal(CryptoUtils.validatePassword('secure123').isValid, true);
  assert.equal(CryptoUtils.validatePassword('12345').isValid, false); // < 6 chars
});

test('CryptoUtils - Password Hashing and Verification', () => {
  const salt = CryptoUtils.generateSalt();
  const hash = CryptoUtils.hashPassword('secretPass123', salt);

  assert.equal(CryptoUtils.verifyPassword('secretPass123', hash, salt), true);
  assert.equal(CryptoUtils.verifyPassword('wrongPass', hash, salt), false);
});

test('AccountManager - Rejects Local Authentication When Cloud Unavailable', async () => {
  // When cloud mode is disabled (no SUPABASE_URL / SUPABASE_ANON_KEY), local login & signup must fail explicitly
  await assert.rejects(async () => {
    await AccountManager.login('any_user', 'any_password');
  }, /unavailable/i);

  await assert.rejects(async () => {
    await AccountManager.createAccount({
      username: 'test_user',
      password: 'Password123!'
    });
  }, /unavailable/i);
});

// Clean up temporary test files
test.after(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
