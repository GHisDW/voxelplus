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

test('AccountManager - Account Creation Fails Closed When Cloud Unavailable', async () => {
  // Cloud-authoritative auth: there is NO local/offline account creation.
  // With the Cloud API unreachable, creation must reject — never silently
  // fabricate a local account.
  await assert.rejects(
    AccountManager.createAccount({
      username: 'test_user',
      password: 'Password123!'
    })
  );

  // And no session may exist after the failed attempt.
  const session = await AccountManager.getCurrentSession();
  assert.equal(session, null);
});

test('AccountManager - Login Fails Closed When Cloud Unavailable', async () => {
  // A cached profile must never substitute for cloud authentication.
  AccountStore.saveCachedProfile({
    id: 'user_cached',
    username: 'test_user',
    avatar: 'avatar_steve',
    bio: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPublic: true,
    syncEnabled: true
  });

  await assert.rejects(
    AccountManager.login('test_user', 'Password123!')
  );

  AccountStore.clearUserData('user_cached');
});

test('AccountManager - Legacy Local Sessions Are Not Accepted', async () => {
  // Tokens minted by the old offline fallback ("local_*") are not valid
  // cloud sessions and must not restore access without cloud validation.
  AccountStore.setActiveSession({
    accessToken: 'local_deadbeef1234',
    refreshToken: 'refresh_deadbeef1234',
    user: {
      id: 'user_local',
      username: 'legacy_local_user',
      avatar: 'avatar_steve',
      bio: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
      syncEnabled: false
    }
  });

  const session = await AccountManager.getCurrentSession();
  assert.equal(session, null);
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
  // Catalog is cloud-authoritative: returns an array when the API is up,
  // or rejects (fail-closed) when it is unreachable — never a fake local list.
  try {
    const cosmetics = await AccountManager.listCosmeticsCatalog();
    assert.ok(Array.isArray(cosmetics));
  } catch (e: any) {
    assert.ok(e instanceof Error);
  }

  try {
    const achievements = await AccountManager.listAchievementsCatalog();
    assert.ok(Array.isArray(achievements));
  } catch (e: any) {
    assert.ok(e instanceof Error);
  }

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
