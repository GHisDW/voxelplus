import type { DataClient } from './store.js';
import { createAccount, issueSession } from './identity.js';
import { createVoxelProfile, removeAccountRecord } from './deletion.js';

export interface SignupInput {
  password: string;
  username: string;
  avatar?: string;
  bio?: string;
  isPublic?: boolean;
}

/**
 * Outcome of `performSignup`. Username+password accounts are single-system:
 * one row in `voxel_accounts` + one row in `voxel_users`. 'orphaned' means
 * the compensation delete of the account row failed — surfaced, never silent.
 */
export type SignupOutcome =
  | { kind: 'username_taken' }
  | { kind: 'signup_failed'; error: string }
  | { kind: 'rolled_back'; error: string }
  | { kind: 'orphaned'; userId: string; error: string }
  | { kind: 'session_failed'; userId: string }
  | { kind: 'success'; userId: string; accessToken: string; refreshToken: string; createdAt: string };

/**
 * Signup pipeline: voxel_accounts credential row → voxel_users profile row
 * → session issuance.
 *
 * A failed profile write deletes the account row (compensation) so a retry
 * is clean; if that compensation fails the account id is reported as
 * orphaned for recovery rather than silently abandoned. A session failure
 * after both rows exist leaves a complete, loginable account.
 */
export async function performSignup(
  db: DataClient,
  input: SignupInput
): Promise<SignupOutcome> {
  const created = await createAccount(db, input.username, input.password);
  if (!created.userId) {
    if (created.error === 'USERNAME_TAKEN') return { kind: 'username_taken' };
    return { kind: 'signup_failed', error: created.error || 'Account creation failed.' };
  }

  const userId = created.userId;
  const now = new Date().toISOString();

  const { error: profileError } = await createVoxelProfile(db, {
    id: userId,
    username: input.username.trim(),
    avatar: input.avatar || 'avatar_steve',
    bio: input.bio || '',
    is_public: input.isPublic !== undefined ? input.isPublic : true,
    updated_at: now,
    created_at: now
  });

  if (profileError) {
    const cleanup = await removeAccountRecord(db, userId);
    if (!cleanup.removed) {
      return { kind: 'orphaned', userId, error: cleanup.error || 'orphan cleanup failed' };
    }
    return { kind: 'rolled_back', error: profileError };
  }

  const session = await issueSession(db, userId);
  if ('error' in session) {
    return { kind: 'session_failed', userId };
  }

  return {
    kind: 'success',
    userId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    createdAt: now
  };
}
