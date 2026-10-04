import test from 'node:test';
import assert from 'node:assert/strict';
import {
  performAccountDeletion,
  completedStepsForStatus,
  statusForStep,
  failedStatusForStep,
  createVoxelProfile,
  compensateOrphanedSignup,
  DELETION_STEPS
} from '../dist/deletion.js';
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
} = {}) {
  const calls: { table: string; op: string; filters: [string, string, any][] }[] = [];
  const deletedAuthUsers: string[] = [];

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
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: { id: 'q1' }, error: null });
    b.then = (res: any) => res(resolveResult(table, op));
    return b;
  }

  function resolveResult(table: string, op: string) {
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
      admin: {
        deleteUser: async (id: string) => {
          deletedAuthUsers.push(id);
          return opts.authDeleteError ? { error: { message: opts.authDeleteError } } : { error: null };
        }
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
