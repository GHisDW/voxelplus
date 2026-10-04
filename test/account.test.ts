import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import { PathManager } from '../dist-electron/backend/storage/paths.js';
import { CryptoUtils } from '../dist-electron/backend/account/cryptoUtils.js';
import { AccountManager } from '../dist-electron/backend/account/accountManager.js';
import { AccountStore } from '../dist-electron/backend/account/accountStore.js';

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

test('AccountStore - Profile Caching and User Data Clear', () => {
  const mockUser = {
    id: 'user_123',
    username: 'test_user',
    avatar: 'avatar_steve',
    bio: 'hello',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPublic: true,
    syncEnabled: true
  };

  AccountStore.saveCachedProfile(mockUser);
  const cached = AccountStore.getCachedProfile();
  assert.ok(cached);
  assert.equal(cached.username, 'test_user');

  AccountStore.clearUserData('user_123');
  assert.equal(AccountStore.getCachedProfile(), null);
});

// Clean up temporary test files
test.after(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
