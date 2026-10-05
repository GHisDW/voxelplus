import type { SupabaseClient } from '@supabase/supabase-js';
import { createVoxelProfile, compensateOrphanedSignup } from './deletion.js';

export interface SignupInput {
  internalEmail: string;
  password: string;
  username: string;
  avatar?: string;
  bio?: string;
  isPublic?: boolean;
}

/**
 * Outcome of `performSignup`. 'admin_unavailable' is returned BEFORE any
 * Auth user is created, so no orphan can exist; 'orphaned' means rollback
 * failed and the id is surfaced for manual recovery — it is never silent.
 */
export type SignupOutcome =
  | { kind: 'admin_unavailable' }
  | { kind: 'signup_failed'; error: string }
  | { kind: 'rolled_back'; error: string }
  | { kind: 'orphaned'; userId: string; error: string }
  | { kind: 'session_failed'; userId: string }
  | { kind: 'success'; userId: string; accessToken: string; refreshToken: string; createdAt: string };

/**
 * Full signup pipeline: Auth signup → voxel_users profile (service-role)
 * → session establishment.
 *
 * Ordering is the safety mechanism: the admin client must be present before
 * `auth.signUp` is called, so there is no path where an Auth identity is
 * created without the ability to attach a profile or roll back. The
 * profile is created before session establishment so a session failure
 * still leaves a complete, loginable account — not a profile-less orphan.
 */
export async function performSignup(
  supabase: SupabaseClient,
  adminSupabase: SupabaseClient | null,
  input: SignupInput
): Promise<SignupOutcome> {
  // Hard requirement: refuse before creating any Auth identity.
  if (!adminSupabase) {
    return { kind: 'admin_unavailable' };
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.internalEmail,
    password: input.password,
    options: {
      data: { username: input.username, avatar: input.avatar, bio: input.bio, isPublic: input.isPublic }
    }
  });

  if (error || !data.user) {
    return { kind: 'signup_failed', error: error?.message || 'Cloud signup failed.' };
  }

  const userId = data.user.id;
  const now = new Date().toISOString();

  const { error: profileError } = await createVoxelProfile(adminSupabase, {
    id: userId,
    username: input.username,
    avatar: input.avatar || 'avatar_steve',
    bio: input.bio || '',
    is_public: input.isPublic !== undefined ? input.isPublic : true,
    updated_at: now,
    created_at: now
  });

  if (profileError) {
    const cleanup = await compensateOrphanedSignup(adminSupabase, userId);
    if (!cleanup.removed) {
      return { kind: 'orphaned', userId, error: cleanup.error || 'orphan cleanup failed' };
    }
    return { kind: 'rolled_back', error: profileError };
  }

  // Email confirmation: if the project requires it, confirm via admin and
  // sign in so the caller gets a session immediately.
  let sessionData = data.session;
  if (!sessionData) {
    await adminSupabase.auth.admin.updateUserById(userId, { email_confirm: true });
    const signInRes = await supabase.auth.signInWithPassword({
      email: input.internalEmail,
      password: input.password
    });
    sessionData = signInRes.data.session;
  }

  if (!sessionData || !sessionData.access_token) {
    return { kind: 'session_failed', userId };
  }

  return {
    kind: 'success',
    userId,
    accessToken: sessionData.access_token,
    refreshToken: sessionData.refresh_token,
    createdAt: now
  };
}
