import test from 'node:test';
import assert from 'node:assert/strict';
import {
  performAccountDeletion,
  completedStepsForStatus,
  statusForStep,
  failedStatusForStep,
  createVoxelProfile,
  compensateOrphanedSignup,
  runTrackedDeletion,
  DELETION_STEPS
} from '../dist/deletion.js';
import { performSignup } from '../dist/signup.js';
import { withLibraryCounts } from '../dist/routes/public.js';

/**
 * Minimal fake Supabase client covering the query shapes used by
 * deletion.ts and public.ts: `.delete().eq()`, `.update().eq()`,
 * `.insert()`, `.upsert()`, `.select().in().in().eq()`,
 * and `auth.admin.deleteUser`.
 */
function makeFakeSupabase(opts: {
  deleteErrors?: Record<string, string>;
  authDeleteError?: string | null;
  upsertError?: string | null;
  libraryRows?: any[];
  libraryError?: string | null;
  queueRow?: { id: string; status: string } | null;
  queueReadError?: string | null;
  queueWriteError?: string | null;
  signupError?: string | null;
  signInError?: string | null;
  session?: any;
} = {}) {
  const calls: { table: string; op: string; filters: [string, string, any][] }[] = [];
  const deletedAuthUsers: string[] = [];
  const signUpCalls: any[] = [];

  function thenable(result: any) {
    return { then: (res: any) => res(result), catch: () => thenable(result) };
  }

  function queryBuilder(table: string, op: string) {
    const rec: { table: string; op: string; filters: [string, string, any][] } = { table, op, filters: [] };
    calls.push(rec);
    const b: any = {};
    for (const m of ['eq', 'neq', 'ilike', 'not', 'in', 'order', 'limit', 'range']) {
      b[m] = (col: string, val?: any, val2?: any) => {
        rec.filters.push([m, col, val2 !== undefined ? val2 : val]);
        return b;
      };
    }
    b.select = () => b;
    b.maybeSingle = () => {
      if (table === 'voxel_account_deletion_queue') {
        return Promise.resolve({
          data: opts.queueRow ?? null,
          error: opts.queueReadError ? { message: opts.queueReadError } : null
        });
      }
      return Promise.resolve({ data: null, error: null });
    };
    b.single = () => {
      if (table === 'voxel_account_deletion_queue' && (op === 'insert' || op === 'update')) {
        return Promise.resolve({
          data: opts.queueWriteError ? null : { id: 'q1', status: 'processing' },
          error: opts.queueWriteError ? { message: opts.queueWriteError } : null
        });
      }
      return Promise.resolve({ data: { id: 'q1' }, error: null });
    };
    b.then = (res: any) => res(resolveResult(table, op));
    return b;
  }

  function resolveResult(table: string, op: string) {
    if (table === 'voxel_account_deletion_queue') {
      const e = opts.queueWriteError ? { message: opts.queueWriteError } : null;
      return { data: null, error: e };
    }
    if (op === 'delete' || op === 'update') {
      const msg = opts.deleteErrors?.[table];
      return { data: null, error: msg ? { message: msg } : null };
    }
    if (op === 'upsert' || op === 'insert') {
      return { data: null, error: opts.upsertError ? { message: opts.upsertError } : null };
    }
    // reads
    if (table === 'voxel_library') {
      return {
        data: opts.libraryRows ?? [],
        error: opts.libraryError ? { message: opts.libraryError } : null
      };
    }
    return { data: null, error: null };
  }

  return {
    calls,
    deletedAuthUsers,
    signUpCalls,
    from(table: string) {
      return {
        delete: () => queryBuilder(table, 'delete'),
        update: () => queryBuilder(table, 'update'),
        select: () => queryBuilder(table, 'read'),
        insert: () => queryBuilder(table, 'insert'),
        upsert: () => queryBuilder(table, 'upsert')
      };
    },
    auth: {
      signUp: async (args: any) => {
        signUpCalls.push(args);
        if (opts.signupError) return { data: { user: null, session: null }, error: { message: opts.signupError } };
        return {
          data: {
            user: { id: 'u1' },
            session: opts.session === undefined ? { access_token: 'at', refresh_token: 'rt' } : opts.session
          },
          error: null
        };
      },
      signInWithPassword: async () =>
        opts.signInError
          ? { data: { session: null }, error: { message: opts.signInError } }
          : { data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null },
      admin: {
        deleteUser: async (id: string) => {
          deletedAuthUsers.push(id);
          return opts.authDeleteError ? { error: { message: opts.authDeleteError } } : { error: null };
        },
        updateUserById: async () => ({ error: null })
      }
    }
  };
}

// ─── Deletion pipeline ───

test('Deletion: complete successful deletion runs every step in order', async () => {
  const supabase = makeFakeSupabase();
  const res = await performAccountDeletion(supabase as any, 'u1');
  assert.equal(res.success, true);
  assert.deepEqual(supabase.deletedAuthUsers, ['u1']);
  const deletedTables = supabase.calls.filter(c => c.op === 'delete').map(c => c.table);
  assert.deepEqual(deletedTables, ['voxel_cloud_sync', 'voxel_library', 'voxel_users']);
  // user-scoped deletes filter on the right columns
  const usersDelete = supabase.calls.find(c => c.op === 'delete' && c.table === 'voxel_users');
  assert.ok(usersDelete!.filters.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === 'u1'));
});

test('Deletion: Auth deletion failure reports failure and does not touch data rows', async () => {
  const supabase = makeFakeSupabase({ authDeleteError: 'auth service down' });
  const res = await performAccountDeletion(supabase as any, 'u1');
  assert.equal(res.success, false);
  assert.equal((res as any).step, 'auth');
  assert.equal(supabase.calls.length, 0);
});

test('Deletion: related-data failure reports the failed step', async () => {
  const supabase = makeFakeSupabase({ deleteErrors: { voxel_library: 'db error' } });
  const res = await performAccountDeletion(supabase as any, 'u1');
  assert.equal(res.success, false);
  assert.equal((res as any).step, 'voxel_library');
});

test('Deletion: retry after cleanup failure resumes and skips completed steps', async () => {
  const completed = completedStepsForStatus(failedStatusForStep('voxel_library'));
  assert.deepEqual([...completed], ['auth', 'voxel_cloud_sync']);

  const supabase = makeFakeSupabase();
  const res = await performAccountDeletion(supabase as any, 'u1', completed);
  assert.equal(res.success, true);
  // Auth delete must NOT be repeated on resume.
  assert.deepEqual(supabase.deletedAuthUsers, []);
  const deletedTables = supabase.calls.filter(c => c.op === 'delete').map(c => c.table);
  assert.deepEqual(deletedTables, ['voxel_library', 'voxel_users']);
});

test('Deletion: repeated deletion after completion is a no-op (idempotent)', async () => {
  const completed = completedStepsForStatus('complete');
  assert.equal(completed.size, DELETION_STEPS.length);
  const supabase = makeFakeSupabase();
  const res = await performAccountDeletion(supabase as any, 'u1', completed);
  assert.equal(res.success, true);
  assert.equal(supabase.calls.length, 0);
  assert.equal(supabase.deletedAuthUsers.length, 0);
});

test('Deletion: missing auth user is treated as already deleted', async () => {
  const supabase = makeFakeSupabase({ authDeleteError: 'User not found' });
  const res = await performAccountDeletion(supabase as any, 'u1');
  assert.equal(res.success, true);
});

// ─── Tracked deletion (queue fail-safe) ───

test('Tracked deletion: queue read failure aborts before any destructive step', async () => {
  const supabase = makeFakeSupabase({ queueReadError: 'connection lost' });
  const res = await runTrackedDeletion(supabase as any, 'u1');
  assert.equal(res.kind, 'queue_unavailable');
  assert.equal(supabase.deletedAuthUsers.length, 0);
  assert.equal(supabase.calls.filter(c => c.op === 'delete').length, 0);
});

test('Tracked deletion: queue creation failure aborts before any destructive step', async () => {
  const supabase = makeFakeSupabase({ queueRow: null, queueWriteError: 'insert denied' });
  const res = await runTrackedDeletion(supabase as any, 'u1');
  assert.equal(res.kind, 'queue_unavailable');
  assert.equal(supabase.deletedAuthUsers.length, 0);
  assert.equal(supabase.calls.filter(c => c.op === 'delete').length, 0);
});

test('Tracked deletion: queue update failure on success is surfaced, never reported complete', async () => {
  const supabase = makeFakeSupabase({ queueRow: { id: 'q1', status: 'processing' }, queueWriteError: 'update lost' });
  const res = await runTrackedDeletion(supabase as any, 'u1');
  assert.equal(res.kind, 'unpersisted');
  // The destructive steps ran, but completion was never persisted — the
  // outcome must not claim success.
  assert.ok(supabase.deletedAuthUsers.length === 1);
});

test('Tracked deletion: cleanup failure is recorded as resumable and a retry completes', async () => {
  // First attempt: voxel_library delete fails; state persisted as failed_voxel_library.
  const first = makeFakeSupabase({ queueRow: { id: 'q1', status: 'processing' }, deleteErrors: { voxel_library: 'timeout' } });
  const r1 = await runTrackedDeletion(first as any, 'u1');
  assert.equal(r1.kind, 'incomplete');
  assert.equal((r1 as any).step, 'voxel_library');

  // Retry: latest row shows failed_voxel_library → resume skips auth+sync.
  const second = makeFakeSupabase({ queueRow: { id: 'q1', status: 'failed_voxel_library' } });
  const r2 = await runTrackedDeletion(second as any, 'u1');
  assert.equal(r2.kind, 'success');
  assert.equal(second.deletedAuthUsers.length, 0); // auth not re-deleted
  const deletedTables = second.calls.filter(c => c.op === 'delete').map(c => c.table);
  assert.deepEqual(deletedTables, ['voxel_library', 'voxel_users']);
});

test('Tracked deletion: successful complete deletion reports success', async () => {
  const supabase = makeFakeSupabase({ queueRow: null });
  const res = await runTrackedDeletion(supabase as any, 'u1');
  assert.equal(res.kind, 'success');
  assert.deepEqual(supabase.deletedAuthUsers, ['u1']);
});

test('Tracked deletion: already-complete job is idempotent (no re-deletion)', async () => {
  const supabase = makeFakeSupabase({ queueRow: { id: 'q1', status: 'complete' } });
  const res = await runTrackedDeletion(supabase as any, 'u1');
  assert.equal(res.kind, 'already_complete');
  assert.equal(supabase.deletedAuthUsers.length, 0);
});

// ─── Signup compensation ───

test('Signup: profile creation failure deletes the orphaned Auth user', async () => {
  const supabase = makeFakeSupabase({ upsertError: 'duplicate key username' });
  const res = await createVoxelProfile(supabase as any, {
    id: 'u1', username: 'x', avatar: 'avatar_steve', bio: '', is_public: true, updated_at: 't'
  });
  assert.ok(res.error);
  const cleanup = await compensateOrphanedSignup(supabase as any, 'u1');
  assert.equal(cleanup.removed, true);
  assert.deepEqual(supabase.deletedAuthUsers, ['u1']);
});

test('Signup: compensation failure is reported accurately', async () => {
  const supabase = makeFakeSupabase({ authDeleteError: 'connection reset' });
  const cleanup = await compensateOrphanedSignup(supabase as any, 'u1');
  assert.equal(cleanup.removed, false);
  assert.ok(cleanup.error);
});

// ─── Public profile counts fallback ───

test('Public profiles: fallback counts real items and preserves isCreator', async () => {
  const libraryRows = [
    { user_id: 'u1', type: 'pack' },
    { user_id: 'u1', type: 'skin' }
  ];
  const supabase = makeFakeSupabase({ libraryRows });
  const out = await withLibraryCounts(supabase as any, [
    { id: 'u1', username: 'a', avatar: 'avatar_steve', avatar_url: null, bio: '', created_at: 't', is_creator: true }
  ]);
  assert.equal(out[0].publicPacksCount, 1);
  assert.equal(out[0].publicSkinsCount, 1);
  assert.equal(out[0].isCreator, true);
});

test('Public profiles: fallback applies an explicit public-metadata filter', async () => {
  const supabase = makeFakeSupabase({ libraryRows: [] });
  await withLibraryCounts(supabase as any, [
    { id: 'u1', username: 'a', avatar: 'avatar_steve', avatar_url: null, bio: '', created_at: 't' }
  ]);
  const libCall = supabase.calls.find(c => c.table === 'voxel_library');
  assert.ok(libCall, 'expected a voxel_library query');
  // Private packs/skins must be excluded: only rows whose metadata explicitly
  // marks them public may be counted — same semantics as the RPC.
  assert.ok(
    libCall.filters.some(f => f[0] === 'eq' && f[1] === 'metadata->>isPublic' && f[2] === 'true'),
    `fallback must filter to metadata.isPublic = true; got filters ${JSON.stringify(libCall.filters)}`
  );
});

test('Public profiles: uploaded avatar_url takes precedence over preset', async () => {
  const supabase = makeFakeSupabase({ libraryRows: [] });
  const out = await withLibraryCounts(supabase as any, [
    { id: 'u1', username: 'a', avatar: 'avatar_steve', avatar_url: 'https://cdn/x.png', bio: '', created_at: 't' }
  ]);
  assert.equal(out[0].avatar, 'https://cdn/x.png');
});

test('Public profiles: library query failure throws (no fabricated zeros)', async () => {
  const supabase = makeFakeSupabase({ libraryError: 'db down' });
  await assert.rejects(() =>
    withLibraryCounts(supabase as any, [
      { id: 'u1', username: 'a', avatar: 'avatar_steve', avatar_url: null, bio: '', created_at: 't' }
    ])
  );
});

// ─── Signup pipeline (orphan elimination) ───

test('Signup: admin client unavailable -> no Auth user is ever created', async () => {
  const supabase = makeFakeSupabase();
  const res = await performSignup(supabase as any, null, {
    internalEmail: 'u@voxel.internal', password: 'secret1', username: 'u'
  });
  assert.equal(res.kind, 'admin_unavailable');
  assert.equal(supabase.signUpCalls.length, 0, 'auth.signUp must not be called without the admin client');
});

test('Signup: happy path returns a session', async () => {
  const supabase = makeFakeSupabase();
  const res = await performSignup(supabase as any, makeFakeSupabase() as any, {
    internalEmail: 'u@voxel.internal', password: 'secret1', username: 'u'
  });
  assert.equal(res.kind, 'success');
  assert.equal((res as any).userId, 'u1');
});

test('Signup: profile failure rolls back the Auth identity', async () => {
  const publicClient = makeFakeSupabase();
  const admin = makeFakeSupabase({ upsertError: 'profile insert failed' });
  const res = await performSignup(publicClient as any, admin as any, {
    internalEmail: 'u@voxel.internal', password: 'secret1', username: 'u'
  });
  assert.equal(res.kind, 'rolled_back');
  assert.deepEqual(admin.deletedAuthUsers, ['u1']);
});

test('Signup: rollback failure reports ORPHANED state with the user id', async () => {
  const publicClient = makeFakeSupabase();
  const admin = makeFakeSupabase({ upsertError: 'profile insert failed', authDeleteError: 'admin api down' });
  const res = await performSignup(publicClient as any, admin as any, {
    internalEmail: 'u@voxel.internal', password: 'secret1', username: 'u'
  });
  assert.equal(res.kind, 'orphaned');
  assert.equal((res as any).userId, 'u1');
  assert.ok((res as any).error);
});

test('Signup: session failure after profile creation leaves a complete account (no orphan)', async () => {
  const publicClient = makeFakeSupabase({ session: null, signInError: 'login failed' });
  const admin = makeFakeSupabase();
  const res = await performSignup(publicClient as any, admin as any, {
    internalEmail: 'u@voxel.internal', password: 'secret1', username: 'u'
  });
  assert.equal(res.kind, 'session_failed');
  // Auth user is NOT deleted — the account exists with a valid profile.
  assert.equal(admin.deletedAuthUsers.length, 0);
});
