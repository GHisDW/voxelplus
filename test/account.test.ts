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

test('AccountManager - Full Lifecycle (Create, Login, Update, Sync, Delete)', async () => {
  // 1. Create Account
  const username = 'Crafter_' + (Date.now() % 100000);
  const session = await AccountManager.createAccount({
    username,
    password: 'Password123!',
    avatar: 'avatar_steve',
    bio: 'Building awesome Fabric mods'
  });

  assert.equal(session.user.username, username);
  assert.equal(session.user.bio, 'Building awesome Fabric mods');
  assert.ok(session.token);

  // 2. Prevent Duplicate Username
  await assert.rejects(async () => {
    await AccountManager.createAccount({
      username,
      password: 'Password123!'
    });
  }, /USERNAME_TAKEN|already taken/);

  // 3. Login
  const loginSession = await AccountManager.login(username, 'Password123!');
  assert.equal(loginSession.user.username, username);

  // 4. Update Profile
  const updated = await AccountManager.updateProfile({
    bio: 'Updated bio for testing',
    isPublic: true
  });
  assert.equal(updated.bio, 'Updated bio for testing');
  assert.equal(updated.isPublic, true);

  // 5. Change Password
  const changeRes = await AccountManager.changePassword({
    oldPassword: 'Password123!',
    newPassword: 'NewSecurePassword456!'
  });
  assert.equal(changeRes, true);

  // Verify new password works on login
  const reLoginSession = await AccountManager.login(username, 'NewSecurePassword456!');
  assert.equal(reLoginSession.user.username, username);

  // 6. Public Directory Sanitization
  const publicProfiles = await AccountManager.listPublicProfiles(username);
  assert.equal(publicProfiles.length, 1);
  assert.equal(publicProfiles[0].username, username);
  assert.equal('passwordHash' in publicProfiles[0], false);
  assert.equal('salt' in publicProfiles[0], false);

  // 7. Save Pack & Skin to Account
  const pack = await AccountManager.savePackToAccount({
    name: 'Ultra Modpack',
    version: '1.0.0'
  });
  assert.equal(pack.authorUsername, username);

  // 8. Delete Account
  const deleteRes = await AccountManager.deleteAccount();
  assert.equal(deleteRes, true);

  const currentSession = await AccountManager.getCurrentSession();
  assert.equal(currentSession, null);
});

// Clean up temporary test files
test.after(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
