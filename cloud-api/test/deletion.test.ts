// Deletion + signup pipeline tests on the in-memory data backend, with
// per-table/per-operation error injection. These cover the tracked,
// resumable, fail-closed deletion design and the rollback semantics of
// username+password signup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  performAccountDeletion,
  completedStepsForStatus,
  failedStatusForStep,
  runTrackedDeletion,
  DELETION_STEPS
} from '../dist/deletion.js';
import { performSignup } from '../dist/signup.js';
import { withLibraryCounts } from '../dist/routes/public.js';
import { MemoryDataClient } from '../dist/memoryStore.js';

type Row = Record<string, any>;

/** Wrap a MemoryDataClient with call recording + injected errors.
 *  `fails` maps '<table>:<op>' (read|insert|upsert|update|delete) → message. */
function makeDb(opts: {
  seed?: Record<string, Row[]>;
  fails?: Record<string, string>;
} = {}) {
  const inner = new MemoryDataClient();
  for (const [table, rows] of Object.entries(opts.seed || {})) {
    for (const row of rows) (inner as any)._table(table).push({ ...row });
  }
  const calls: { table: string; op: string }[] = [];
  const fails = opts.fails || {};

  const db = {
    calls,
    inner,
    from(table: string) {
      const real = inner.from(table);
      const wrap = (builder: any, op: string): any => {
        calls.push({ table, op });
        const msg = fails[`${table}:${op}`];
        if (!msg) return builder;
        const err = Promise.resolve({ data: null, error: { message: msg } });
        return new Proxy(builder, {
          get(target, prop) {
            if (prop === 'then') return (res: any, rej?: any) => err.then(res, rej);
            if (prop === 'maybeSingle' || prop === 'single') return () => err;
            const v = (target as any)[prop];
            return typeof v === 'function' ? (...a: any[]) => wrap(v.apply(target, a), op) : v;
          }
        });
      };
      return {
        select: (...a: any[]) => wrap(real.select(...a), 'read'),
        insert: (...a: any[]) => wrap(real.insert(...a), 'insert'),
        upsert: (...a: any[]) => wrap(real.upsert(...a), 'upsert'),
        update: (...a: any[]) => wrap(real.update(...a), 'update'),
        delete: () => wrap(real.delete(), 'delete')
      };
    },
    rpc: (fn: string, args?: any) => inner.rpc(fn, args),
    storage: inner.storage
  };
  return db;
}

const deletes = (db: any) => db.calls.filter((c: any) => c.op === 'delete').map((c: any) => c.table);

// ─── Deletion pipeline ───

test('Deletion: complete deletion removes account record, sessions, and every owned table', async () => {
  const db = makeDb({ seed: { voxel_accounts: [{ id: 'u1', username: 'x', password_hash: 'scrypt$1$y$z' }] } });
  const res = await performAccountDeletion(db as any, 'u1');
  assert.equal(res.success, true);
  const deletedTables = deletes(db);
  for (const table of [
    'voxel_sessions', 'voxel_accounts', 'voxel_cloud_sync', 'voxel_library',
    'voxel_user_cosmetics', 'voxel_user_achievements', 'voxel_user_titles',
    'voxel_user_badges', 'voxel_instances', 'voxel_ad_progress',
    'voxel_ad_completions', 'voxel_owner_roles', 'voxel_users'
  ]) {
    assert.ok(deletedTables.includes(table), `expected delete on ${table}`);
  }
});

test('Deletion: account-record removal failure aborts before data rows', async () => {
  const db = makeDb({ fails: { 'voxel_accounts:delete': 'constraint violation' } });
  const res = await performAccountDeletion(db as any, 'u1');
  assert.equal(res.success, false);
  assert.equal((res as any).step, 'account');
  assert.ok(!deletes(db).includes('voxel_users'));
});

test('Deletion: related-data failure reports the failed step', async () => {
  const db = makeDb({ fails: { 'voxel_library:delete': 'db error' } });
  const res = await performAccountDeletion(db as any, 'u1');
  assert.equal(res.success, false);
  assert.equal((res as any).step, 'voxel_library');
});

test('Deletion: resume skips already-completed steps', async () => {
  const completed = completedStepsForStatus(failedStatusForStep('voxel_library'));
  assert.deepEqual([...completed], ['account', 'voxel_cloud_sync']);

  const db = makeDb();
  const res = await performAccountDeletion(db as any, 'u1', completed);
  assert.equal(res.success, true);
  assert.ok(!deletes(db).includes('voxel_accounts'), 'account step must not re-run');
});

test('Deletion: repeated deletion after completion is a no-op (idempotent)', async () => {
  const completed = completedStepsForStatus('complete');
  assert.equal(completed.size, DELETION_STEPS.length);
  const db = makeDb();
  const res = await performAccountDeletion(db as any, 'u1', completed);
  assert.equal(res.success, true);
  assert.equal(db.calls.length, 0);
});

// ─── Tracked deletion (queue fail-safe) ───

test('Tracked deletion: queue read failure aborts before any destructive step', async () => {
  const db = makeDb({ fails: { 'voxel_account_deletion_queue:read': 'connection lost' } });
  const res = await runTrackedDeletion(db as any, 'u1');
  assert.equal(res.kind, 'queue_unavailable');
  assert.equal(deletes(db).length, 0);
});

test('Tracked deletion: queue creation failure aborts before any destructive step', async () => {
  const db = makeDb({ fails: { 'voxel_account_deletion_queue:insert': 'insert denied' } });
  const res = await runTrackedDeletion(db as any, 'u1');
  assert.equal(res.kind, 'queue_unavailable');
  assert.equal(deletes(db).length, 0);
});

test('Tracked deletion: queue update failure is surfaced, never reported complete', async () => {
  const db = makeDb({
    seed: { voxel_account_deletion_queue: [{ id: 'q1', user_id: 'u1', status: 'processing' }] },
    fails: { 'voxel_account_deletion_queue:update': 'update lost' }
  });
  const res = await runTrackedDeletion(db as any, 'u1');
  assert.equal(res.kind, 'unpersisted');
  assert.ok(deletes(db).length > 0, 'destructive steps ran but completion was not persisted');
});

test('Tracked deletion: cleanup failure is recorded and a retry completes', async () => {
  const first = makeDb({ fails: { 'voxel_library:delete': 'timeout' } });
  const r1 = await runTrackedDeletion(first as any, 'u1');
  assert.equal(r1.kind, 'incomplete');
  assert.equal((r1 as any).step, 'voxel_library');

  const second = makeDb({
    seed: { voxel_account_deletion_queue: [{ id: 'q1', user_id: 'u1', status: 'failed_voxel_library' }] }
  });
  const r2 = await runTrackedDeletion(second as any, 'u1');
  assert.equal(r2.kind, 'success');
  assert.ok(!deletes(second).includes('voxel_accounts'), 'account step must not re-run on resume');
  assert.ok(deletes(second).includes('voxel_library'));
});

test('Tracked deletion: successful complete deletion reports success', async () => {
  const db = makeDb({ seed: { voxel_accounts: [{ id: 'u1' }] } });
  const res = await runTrackedDeletion(db as any, 'u1');
  assert.equal(res.kind, 'success');
  const queueRows = (db.inner as any)._table('voxel_account_deletion_queue');
  assert.equal(queueRows[0].status, 'complete');
});

test('Tracked deletion: already-complete job is idempotent', async () => {
  const db = makeDb({
    seed: { voxel_account_deletion_queue: [{ id: 'q1', user_id: 'u1', status: 'complete' }] }
  });
  const res = await runTrackedDeletion(db as any, 'u1');
  assert.equal(res.kind, 'already_complete');
  assert.equal(deletes(db).length, 0);
});

// ─── Signup pipeline (username+password, no email) ───

test('Signup: happy path creates account + profile + session', async () => {
  const db = makeDb();
  const res = await performSignup(db as any, { username: 'newplayer', password: 'secret1' });
  assert.equal(res.kind, 'success');
  assert.ok((res as any).accessToken);
  const accounts = (db.inner as any)._table('voxel_accounts');
  assert.equal(accounts.length, 1);
  assert.ok(accounts[0].password_hash.startsWith('scrypt$'));
  const profiles = (db.inner as any)._table('voxel_users');
  assert.equal(profiles[0].username, 'newplayer');
  const sessions = (db.inner as any)._table('voxel_sessions');
  assert.equal(sessions.length, 1);
});

test('Signup: no email is used or stored anywhere', async () => {
  const db = makeDb();
  const res = await performSignup(db as any, { username: 'nomail', password: 'secret1' });
  assert.equal(res.kind, 'success');
  const account = (db.inner as any)._table('voxel_accounts')[0];
  assert.equal(account.email, undefined);
  assert.ok(!JSON.stringify(account).includes('@'), 'no email material in account row');
});

test('Signup: profile failure rolls back the credential row', async () => {
  const db = makeDb({ fails: { 'voxel_users:upsert': 'profile insert failed' } });
  const res = await performSignup(db as any, { username: 'rollback_user', password: 'secret1' });
  assert.equal(res.kind, 'rolled_back');
  assert.equal((db.inner as any)._table('voxel_accounts').length, 0, 'account row must be removed');
});

test('Signup: rollback failure reports the orphaned state with the user id', async () => {
  const db = makeDb({
    fails: { 'voxel_users:upsert': 'profile insert failed', 'voxel_accounts:delete': 'delete denied' }
  });
  const res = await performSignup(db as any, { username: 'orphan_user', password: 'secret1' });
  assert.equal(res.kind, 'orphaned');
  assert.ok((res as any).userId);
  assert.ok((res as any).error);
});

test('Signup: session failure leaves a complete account (loginable, not orphaned)', async () => {
  const db = makeDb({ fails: { 'voxel_sessions:insert': 'session insert failed' } });
  const res = await performSignup(db as any, { username: 'sess_user', password: 'secret1' });
  assert.equal(res.kind, 'session_failed');
  assert.equal((db.inner as any)._table('voxel_accounts').length, 1);
  assert.equal((db.inner as any)._table('voxel_users').length, 1);
});

// ─── Public profile counts fallback ───

test('Public profiles: fallback counts real items and preserves isCreator', async () => {
  const db = makeDb({
    seed: {
      voxel_library: [
        { user_id: 'u1', type: 'pack', metadata: { isPublic: 'true' } },
        { user_id: 'u1', type: 'skin', metadata: { isPublic: 'true' } }
      ]
    }
  });
  const out = await withLibraryCounts(db as any, [
    { id: 'u1', username: 'a', avatar: 'avatar_steve', avatar_url: null, bio: '', created_at: 't', is_creator: true }
  ]);
  assert.equal(out[0].publicPacksCount, 1);
  assert.equal(out[0].publicSkinsCount, 1);
  assert.equal(out[0].isCreator, true);
});

test('Public profiles: private library items are excluded from public counts', async () => {
  const db = makeDb({
    seed: {
      voxel_library: [
        { user_id: 'u1', type: 'pack', metadata: { isPublic: 'true' } },
        { user_id: 'u1', type: 'pack', metadata: { isPublic: 'false' } },
        { user_id: 'u1', type: 'pack', metadata: {} },
        { user_id: 'u1', type: 'skin', metadata: {} }
      ]
    }
  });
  const out = await withLibraryCounts(db as any, [
    { id: 'u1', username: 'a', avatar: 'avatar_steve', avatar_url: null, bio: '', created_at: 't' }
  ]);
  assert.equal(out[0].publicPacksCount, 1, 'only the explicitly-public pack counts');
  assert.equal(out[0].publicSkinsCount, 0);
});

test('Public profiles: uploaded avatar_url takes precedence over preset', async () => {
  const db = makeDb({ seed: { voxel_library: [] } });
  const out = await withLibraryCounts(db as any, [
    { id: 'u1', username: 'a', avatar: 'avatar_steve', avatar_url: 'https://cdn/x.png', bio: '', created_at: 't' }
  ]);
  assert.equal(out[0].avatar, 'https://cdn/x.png');
});
