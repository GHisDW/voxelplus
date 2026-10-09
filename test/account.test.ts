import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoUtils } from '../dist-electron/backend/account/cryptoUtils.js';
import { AccountStore } from '../dist-electron/backend/account/accountStore.js';
import { AccountManager } from '../dist-electron/backend/account/accountManager.js';

test('username validation remains client-side UX only', () => {
  assert.equal(CryptoUtils.validateUsername('valid_user').isValid, true);
  assert.equal(CryptoUtils.validateUsername('v1').isValid, false);
  assert.equal(CryptoUtils.validateUsername('user@invalid!').isValid, false);
});

test('cached profile is data, never an authentication credential', () => {
  const profile = { id: 'user_123', username: 'test_user', avatar: 'avatar_steve', bio: 'hello', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isPublic: true, syncEnabled: true };
  AccountStore.saveCachedProfile(profile);
  assert.equal(AccountStore.getCachedProfile()?.username, 'test_user');
  AccountStore.clearUserData('user_123');
  assert.equal(AccountStore.getCachedProfile(), null);
});

test('launcher has no local administrative identity or session', async () => {
  assert.equal(await AccountManager.getCurrentSession(), null);
});
