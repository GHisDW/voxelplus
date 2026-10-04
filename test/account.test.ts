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

test('AccountManager - Handles Account Creation and Authentication Fallback', async () => {
  // When cloud mode or cloud API endpoint is unavailable, account creation & login must succeed gracefully with local fallback
  const created = await AccountManager.createAccount({
    username: 'test_user',
    password: 'Password123!'
  });
  assert.ok(created);
  assert.equal(created.user.username, 'test_user');
  assert.ok(created.accessToken);

  const loginSession = await AccountManager.login('test_user', 'Password123!');
  assert.ok(loginSession);
  assert.equal(loginSession.user.username, 'test_user');
});

test('AccountManager - Session Enforcement and Startup Validation', async () => {
  const mockProfile = {
    id: 'user_999',
    username: 'session_user',
    avatar: 'avatar_steve',
    bio: 'testing session validation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPublic: true,
    syncEnabled: true
  };

  // 1. Session with invalid/unverified cloud token fails and revokes session
  AccountStore.setActiveSession({
    accessToken: 'invalid_token_xyz',
    refreshToken: 'mock_refresh_token',
    user: mockProfile
  });

  const sessionWhenCloudDisabled = await AccountManager.getCurrentSession();
  assert.equal(sessionWhenCloudDisabled, null); // Cloud unconfigured / token invalid -> revokes session

  // 2. Malformed cached session returns null
  AccountStore.saveCachedProfile(null);
  const malformedSession = await AccountManager.getCurrentSession();
  assert.equal(malformedSession, null);
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

test('AccountManager - Owner Panel Authorization Guard', async () => {
  // Unauthenticated user must not have owner status
  const ownerStatus = await AccountManager.checkOwnerStatus();
  assert.equal(ownerStatus.isOwner, false);
  assert.equal(ownerStatus.role, null);

  // Privileged actions must reject when unauthenticated
  await assert.rejects(async () => {
    await AccountManager.getOwnerUsers();
  });

  await assert.rejects(async () => {
    await AccountManager.ownerBulkDelete('DELETE_ALL_ACCOUNTS_PERMANENTLY');
  });

  await assert.rejects(async () => {
    await AccountManager.grantTitle('some_user_id', 'developer');
  });
});

test('AccountManager - Cosmetics and Achievements Access', async () => {
  // Public catalog access
  const cosmetics = await AccountManager.listCosmeticsCatalog();
  assert.ok(Array.isArray(cosmetics));

  const achievements = await AccountManager.listAchievementsCatalog();
  assert.ok(Array.isArray(achievements));

  // User cosmetics & selection without auth returns empty or throws
  const userCosmetics = await AccountManager.getUserCosmetics();
  assert.deepEqual(userCosmetics, []);

  await assert.rejects(async () => {
    await AccountManager.selectCosmetic('dirt_block');
  });
});

test('AccountManager - Avatar Authorization Guard', async () => {
  // Avatar upload without auth must reject
  await assert.rejects(async () => {
    const dummyBuffer = new Uint8Array([1, 2, 3]);
    await AccountManager.uploadAvatar(dummyBuffer, 'avatar.png', 'image/png');
  });
});

// Clean up temporary test files
test.after(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
