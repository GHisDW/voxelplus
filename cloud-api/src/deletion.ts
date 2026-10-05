import type { DataClient } from './store.js';

export interface VoxelProfileInsert {
  id: string;
  username: string;
  avatar: string;
  bio: string;
  is_public: boolean;
  updated_at: string;
  created_at?: string;
}

/**
 * Creates the `voxel_users` profile after a successful account creation.
 * Writes through the privileged data client — RLS does not apply to the
 * service backend, and this write must not silently fail: the caller
 * compensates (deletes the account row) on any error.
 */
export async function createVoxelProfile(
  db: DataClient,
  profile: VoxelProfileInsert
): Promise<{ error: string | null }> {
  // upsert (not insert): a signup retried after a partially-failed prior
  // deletion may find a stale voxel_users row for the same account id.
  const { error } = await (db as any)
    .from('voxel_users')
    .upsert(profile, { onConflict: 'id' });
  return { error: error ? error.message : null };
}

/**
 * Compensation for a failed profile creation: removes the newly-created
 * `voxel_accounts` credential row (and any sessions) so the signup can be
 * cleanly retried. Returns whether cleanup succeeded.
 */
export async function removeAccountRecord(
  db: DataClient,
  userId: string
): Promise<{ removed: boolean; error: string | null }> {
  const { error: sessErr } = await (db as any).from('voxel_sessions').delete().eq('user_id', userId);
  if (sessErr) return { removed: false, error: sessErr.message };
  const { error } = await (db as any).from('voxel_accounts').delete().eq('id', userId);
  if (error) {
    const missing = /not found|does not exist|404/i.test(error.message || '');
    return { removed: missing, error: missing ? null : error.message };
  }
  return { removed: true, error: null };
}

/**
 * Ordered, resumable account deletion pipeline.
 *
 * Each step is recorded in `voxel_account_deletion_queue.status` as it
 * completes, so a deletion that fails partway can be resumed safely and
 * repeated requests are idempotent — already-completed steps are skipped.
 *
 * Statuses:
 *   'processing'               — job created, nothing done yet
 *   'account_deleted'          — voxel_accounts + voxel_sessions removed
 *   'voxel_cloud_sync_deleted' — cloud sync rows removed
 *   'voxel_library_deleted'    — library rows removed
 *   'voxel_user_data_deleted'  — cosmetics/achievements/titles/badges,
 *                                instances, ad progress/completions, roles
 *   'complete'                 — voxel_users profile removed; fully deleted
 *   'failed_<step>'            — last attempt failed at <step>
 */
export type DeletionStep = 'account' | 'voxel_cloud_sync' | 'voxel_library' | 'voxel_user_data' | 'voxel_users';

export const DELETION_STEPS: DeletionStep[] = [
  'account',
  'voxel_cloud_sync',
  'voxel_library',
  'voxel_user_data',
  'voxel_users'
];

/** Every per-user table cleared by the 'voxel_user_data' step. */
const USER_DATA_TABLES = [
  'voxel_user_cosmetics',
  'voxel_user_achievements',
  'voxel_user_titles',
  'voxel_user_badges',
  'voxel_instances',
  'voxel_ad_progress',
  'voxel_ad_completions',
  'voxel_owner_roles'
] as const;

/** Maps a completed step to the queue status recorded for it. */
export function statusForStep(step: DeletionStep): string {
  return step === 'voxel_users' ? 'complete' : `${step}_deleted`;
}

/** Queue status recorded when a step fails (encodes resume position). */
export function failedStatusForStep(step: DeletionStep): string {
  return `failed_${step}`;
}

/** Derives which pipeline steps are already done from a queue status. */
export function completedStepsForStatus(status: string | null | undefined): Set<DeletionStep> {
  const done = new Set<DeletionStep>();
  if (!status) return done;
  if (status === 'complete') {
    DELETION_STEPS.forEach(s => done.add(s));
    return done;
  }
  if (status === 'failed' || status.startsWith('failed_')) {
    // 'failed_<step>' marks every step before <step> as complete.
    const failedStep = status.slice('failed_'.length) as DeletionStep;
    const failIdx = DELETION_STEPS.indexOf(failedStep);
    if (failIdx > 0) {
      for (let i = 0; i < failIdx; i++) done.add(DELETION_STEPS[i]);
    }
    return done;
  }
  const idx = DELETION_STEPS.findIndex(s => statusForStep(s) === status);
  if (idx >= 0) {
    for (let i = 0; i <= idx; i++) done.add(DELETION_STEPS[i]);
  }
  return done;
}

export type DeletionResult =
  | { success: true }
  | { success: false; step: DeletionStep; error: string };

/**
 * Runs the deletion pipeline for one user. Steps already present in
 * `completed` are skipped (resume/idempotency). The credential record is
 * always removed first — data rows are never removed for an account whose
 * identity deletion may have failed.
 *
 * Returns the first failing step; callers persist progress so cleanup is
 * retryable. Never reports success on a partial deletion.
 */
export async function performAccountDeletion(
  db: DataClient,
  userId: string,
  completed: Set<DeletionStep> = new Set()
): Promise<DeletionResult> {
  if (!completed.has('account')) {
    const cleanup = await removeAccountRecord(db, userId);
    if (!cleanup.removed) {
      return { success: false, step: 'account', error: cleanup.error || 'account delete failed' };
    }
  }

  for (const table of ['voxel_cloud_sync', 'voxel_library'] as const) {
    if (completed.has(table)) continue;
    const { error } = await (db as any).from(table).delete().eq('user_id', userId);
    if (error) {
      return { success: false, step: table, error: error.message };
    }
  }

  if (!completed.has('voxel_user_data')) {
    for (const table of USER_DATA_TABLES) {
      const col = 'user_id';
      const { error } = await (db as any).from(table).delete().eq(col, userId);
      if (error) {
        return { success: false, step: 'voxel_user_data', error: `${table}: ${error.message}` };
      }
    }
  }

  if (!completed.has('voxel_users')) {
    const { error } = await (db as any).from('voxel_users').delete().eq('id', userId);
    if (error) {
      return { success: false, step: 'voxel_users', error: error.message };
    }
  }

  return { success: true };
}

export interface DeletionQueueRow {
  id: string;
  status: string;
}

/**
 * Finds the most recent deletion-queue row for a user (any status).
 * Returns { error } when the queue cannot be read — a destructive deletion
 * must NOT proceed without verifiable tracking state.
 */
export async function findLatestQueueRow(
  db: DataClient,
  userId: string
): Promise<{ row: DeletionQueueRow | null; error: string | null }> {
  const { data, error } = await (db as any)
    .from('voxel_account_deletion_queue')
    .select('id, status')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as DeletionQueueRow | null) ?? null, error: null };
}

/**
 * Persists queue state: updates an existing row by id, or inserts a new
 * job row when rowId is undefined. Returns { error } when the write failed —
 * deletion progress is only resumable when this returns a row.
 */
export async function updateQueueRow(
  db: DataClient,
  rowId: string | undefined,
  userId: string,
  status: string,
  completedAt?: string
): Promise<{ row: DeletionQueueRow | null; error: string | null }> {
  if (rowId) {
    const update: Record<string, any> = { status };
    if (completedAt) update.completed_at = completedAt;
    const { error } = await (db as any)
      .from('voxel_account_deletion_queue')
      .update(update)
      .eq('id', rowId);
    if (error) return { row: null, error: error.message };
    return { row: { id: rowId, status }, error: null };
  }
  const { data, error } = await (db as any)
    .from('voxel_account_deletion_queue')
    .insert({ user_id: userId, status })
    .select('id, status')
    .single();
  if (error) return { row: null, error: error.message };
  return { row: (data as DeletionQueueRow | null) ?? null, error: null };
}

/**
 * Outcome of a fully queue-tracked deletion attempt. Routes map these to
 * responses; nothing is ever reported as deleted unless the queue state
 * confirms completion.
 */
export type TrackedDeletionOutcome =
  | { kind: 'success' }
  | { kind: 'already_complete' }
  | { kind: 'incomplete'; step: DeletionStep; error: string }
  | { kind: 'queue_unavailable'; error: string }
  | { kind: 'unpersisted'; step?: DeletionStep; error: string };

/**
 * Queue-tracked account deletion. The pipeline only runs when durable
 * tracking state exists: an unreadable queue or an unwritable job row
 * aborts BEFORE any destructive step. A status update that fails is
 * surfaced ('unpersisted') and never reported as a completed deletion.
 * Retries resume from the persisted step (idempotent).
 */
export async function runTrackedDeletion(
  db: DataClient,
  userId: string
): Promise<TrackedDeletionOutcome> {
  const found = await findLatestQueueRow(db, userId);
  if (found.error) {
    return { kind: 'queue_unavailable', error: `Deletion state unreadable: ${found.error}` };
  }

  let row = found.row;
  if (row?.status === 'complete') {
    return { kind: 'already_complete' };
  }
  if (!row) {
    const created = await updateQueueRow(db, undefined, userId, 'processing');
    if (created.error || !created.row) {
      return {
        kind: 'queue_unavailable',
        error: `Deletion state could not be persisted: ${created.error || 'insert returned no row'}`
      };
    }
    row = created.row;
  }

  const completed = completedStepsForStatus(row.status);
  const result = await performAccountDeletion(db, userId, completed);

  if (!result.success) {
    const upd = await updateQueueRow(db, row.id, userId, failedStatusForStep(result.step));
    if (upd.error) {
      return {
        kind: 'unpersisted',
        step: result.step,
        error: `${result.error}; additionally, the deletion state update failed: ${upd.error}`
      };
    }
    return { kind: 'incomplete', step: result.step, error: result.error };
  }

  const upd = await updateQueueRow(db, row.id, userId, 'complete', new Date().toISOString());
  if (upd.error) {
    // Deletion steps ran but the completion state was not persisted —
    // report honestly instead of claiming a tracked, completed deletion.
    return {
      kind: 'unpersisted',
      error: `Deletion steps completed but the completion state could not be persisted: ${upd.error}`
    };
  }
  return { kind: 'success' };
}
