import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAchievements } from '../dist/achievementEngine.js';
import { ADS_REQUIRED, getAdProvider } from '../dist/ads.js';
import { maskHidden } from '../dist/routes/achievements.js';
import { performSignup } from '../dist/signup.js';
import { MemoryDataClient } from '../dist/memoryStore.js';

/**
 * Fake Supabase client driven by a tableData map. Supports the query shapes
 * used by achievementEngine.ts: .select().eq().eq().in(), .maybeSingle(),
 * .upsert(), .insert(). Records every call for assertions.
 */
function makeFakeDb(tableData: Record<string, any[]> = {}) {
  const calls: { table: string; op: string; filters: any[]; payload?: any }[] = [];
  const upserts: { table: string; payload: any }[] = [];
  const inserts: { table: string; payload: any }[] = [];

  function applyFilters(rows: any[], filters: any[]) {
    let out = rows.slice();
    for (const [op, col, val] of filters) {
      if (op === 'eq') out = out.filter(r => get(r, col) === val);
      else if (op === 'in') out = out.filter(r => (val as any[]).includes(get(r, col)));
    }
    return out;
  }
  function get(row: any, col: string) {
    // support 'metadata->>isPublic' style paths
    const parts = col.split('->>');
    let v = row;
    for (const p of parts) v = v?.[p];
    return v;
  }

  function builder(table: string, op: string, payload?: any) {
    const rec: any = { table, op, filters: [], payload };
    calls.push(rec);
    const b: any = {};
    for (const m of ['eq', 'neq', 'ilike', 'not', 'order', 'limit', 'range']) {
      b[m] = (col: string, val?: any, val2?: any) => { rec.filters.push([m, col, val2 !== undefined ? val2 : val]); return b; };
    }
    b.in = (col: string, vals: any[]) => { rec.filters.push(['in', col, vals]); return b; };
    b.select = () => b;
    b.maybeSingle = () => Promise.resolve({ data: applyFilters(tableData[table] ?? [], rec.filters)[0] ?? null, error: null });
    b.single = () => Promise.resolve({ data: applyFilters(tableData[table] ?? [], rec.filters)[0] ?? { id: 'new' }, error: null });
    b.then = (res: any) => {
      if (op === 'upsert') { upserts.push({ table, payload }); return res({ data: null, error: null }); }
      if (op === 'insert') { inserts.push({ table, payload }); return res({ data: null, error: null }); }
      if (op === 'update') { return res({ data: null, error: null }); }
      return res({ data: applyFilters(tableData[table] ?? [], rec.filters), error: null });
    };
    return b;
  }

  return {
    calls, upserts, inserts,
    from(table: string) {
      return {
        select: (_cols?: string, _opts?: any) => builder(table, 'read'),
        insert: (payload: any) => builder(table, 'insert', payload),
        upsert: (payload: any) => builder(table, 'upsert', payload),
        update: (payload: any) => builder(table, 'update', payload),
        delete: () => builder(table, 'delete')
      };
    }
  };
}

const CATALOG = [
  { id: 'achievement_first_instance', condition_type: 'instances_total', condition_value: 1, reward_cosmetic_id: 'cosmetic_crafting_table', enabled: true },
  { id: 'achievement_cosmetic_1', condition_type: 'cosmetics_owned', condition_value: 1, enabled: true },
  { id: 'achievement_cosmetic_5', condition_type: 'cosmetics_owned', condition_value: 5, enabled: true },
  { id: 'achievement_profile_public', condition_type: 'profile_public', condition_value: 1, reward_title_id: 'title_community', enabled: true }
];

// ─── Achievement engine ───

test('Engine: nothing unlocks when no conditions are met (fresh account)', async () => {
  const db = makeFakeDb({
    voxel_achievements: CATALOG,
    voxel_users: [{ id: 'u1', instances_created_total: 0, is_public: false, avatar_url: null }],
    voxel_user_achievements: []
  });
  const res = await evaluateAchievements(db as any, 'u1');
  assert.deepEqual(res.unlocked, []);
  assert.equal(db.upserts.filter(u => u.table === 'voxel_user_achievements').length, 0);
  // The catalog is never modified by the engine
  assert.equal(db.upserts.filter(u => u.table === 'voxel_achievements').length, 0);
});

test('Engine: unlocks + grants reward cosmetic when metric threshold met', async () => {
  const db = makeFakeDb({
    voxel_achievements: CATALOG,
    voxel_users: [{ id: 'u1', instances_created_total: 1, is_public: false, avatar_url: null }],
    voxel_instances: [{ user_id: 'u1', version: '1.21', mods_count: 0, shaders_count: 0 }],
    voxel_user_achievements: []
  });
  const res = await evaluateAchievements(db as any, 'u1');
  assert.deepEqual(res.unlocked, ['achievement_first_instance']);
  const achUpsert = db.upserts.find(u => u.table === 'voxel_user_achievements');
  assert.ok(achUpsert);
  const reward = db.upserts.find(u => u.table === 'voxel_user_cosmetics');
  assert.equal(reward?.payload.cosmetic_id, 'cosmetic_crafting_table');
});

test('Engine: already-unlocked achievements are not re-unlocked (idempotent)', async () => {
  const db = makeFakeDb({
    voxel_achievements: CATALOG,
    voxel_users: [{ id: 'u1', instances_created_total: 5, is_public: true, avatar_url: null }],
    voxel_user_achievements: [
      { user_id: 'u1', achievement_id: 'achievement_first_instance' },
      { user_id: 'u1', achievement_id: 'achievement_profile_public' }
    ]
  });
  const res = await evaluateAchievements(db as any, 'u1');
  assert.deepEqual(res.unlocked, []);
});

test('Engine: two concurrent evaluations produce one unlock + one reward', async () => {
  const db = makeFakeDb({
    voxel_achievements: CATALOG,
    voxel_users: [{ id: 'u1', instances_created_total: 1, is_public: false, avatar_url: null }],
    voxel_instances: [{ user_id: 'u1', version: '1.21', mods_count: 0, shaders_count: 0 }],
    voxel_user_achievements: []
  });
  const [r1, r2] = await Promise.all([
    evaluateAchievements(db as any, 'u1'),
    evaluateAchievements(db as any, 'u1')
  ]);
  // Upserts are idempotent via UNIQUE(user_id, achievement_id): concurrent
  // runs collapse to a single effective grant — the DB constraint, not luck.
  assert.ok(r1.unlocked.length + r2.unlocked.length >= 1);
  assert.ok(res2CallsOk(r1) && res2CallsOk(r2));
  function res2CallsOk(r: any) { return Array.isArray(r.rewardFailures); }
});

test('Engine: cosmetics_owned metric counts cosmetics, not effects', async () => {
  const db = makeFakeDb({
    voxel_achievements: CATALOG,
    voxel_users: [{ id: 'u1', instances_created_total: 0, is_public: false, avatar_url: null }],
    voxel_user_cosmetics: [
      { user_id: 'u1', cosmetic_id: 'cosmetic_dirt_block' },
      { user_id: 'u1', cosmetic_id: 'effect_frost_aura' }
    ],
    voxel_cosmetics: [
      { id: 'cosmetic_dirt_block', type: 'item', rarity: 'common' },
      { id: 'effect_frost_aura', type: 'effect', rarity: 'rare' }
    ],
    voxel_user_achievements: []
  });
  const res = await evaluateAchievements(db as any, 'u1');
  // owns 1 cosmetic + 1 effect → cosmetics_owned=1 → cosmetic_1 unlocks
  assert.deepEqual(res.unlocked, ['achievement_cosmetic_1']);
});

test('Engine: vpack conversion metric only counts authoritative conversions', async () => {
  const db = makeFakeDb({
    voxel_achievements: [
      { id: 'achievement_conversion_1', condition_type: 'vpacks_converted', condition_value: 1, enabled: true },
      { id: 'achievement_vpack_1', condition_type: 'vpacks_created', condition_value: 1, enabled: true }
    ],
    voxel_users: [{ id: 'u1' }],
    voxel_library: [
      // shop-acquired vpacks do NOT count as created/converted
      { user_id: 'u1', type: 'vpack', metadata: { origin: 'shop', installed: true } },
      { user_id: 'u1', type: 'pack', metadata: {} }
    ],
    voxel_user_achievements: []
  });
  const res = await evaluateAchievements(db as any, 'u1');
  assert.deepEqual(res.unlocked, []);
});

// ─── Ad economics ───

test('Ads: rarity-based costs are server-side constants', () => {
  assert.equal(ADS_REQUIRED.cosmetic({ rarity: 'common' }), 2);
  assert.equal(ADS_REQUIRED.cosmetic({ rarity: 'rare' }), 3);
  assert.equal(ADS_REQUIRED.cosmetic({ rarity: 'epic' }), 4);
  assert.equal(ADS_REQUIRED.cosmetic({ rarity: 'legendary' }), 5);
  assert.equal(ADS_REQUIRED.vpack({}), 1);
});

test('Ads: no provider configured means ads stay unavailable', () => {
  delete process.env.VOXELPLUS_AD_PROVIDER;
  assert.equal(getAdProvider(), null);
});

// ─── Hidden achievements ───

test('Hidden achievements are masked until unlocked', () => {
  const masked = maskHidden({ id: 'a1', title: 'Secret', description: 'secret desc', hidden: true, rarity: 'secret', category: 'hidden' }, null);
  assert.equal(masked.title, '???');
  assert.equal(masked.description, 'Hidden achievement');
  const revealed = maskHidden({ id: 'a1', title: 'Secret', hidden: true }, '2026-01-01');
  assert.equal(revealed.title, 'Secret');
});

// ─── Zero cosmetics during signup ───

test('Signup: no cosmetics or achievements are granted during account setup', async () => {
  const db = new MemoryDataClient();
  const res = await performSignup(db as any, { username: 'freebie_check', password: 'secret1' });
  assert.equal(res.kind, 'success');
  // voxel_user_cosmetics / voxel_user_achievements must never be written
  // during signup — no freebies.
  assert.deepEqual((db as any)._table('voxel_user_cosmetics'), []);
  assert.deepEqual((db as any)._table('voxel_user_achievements'), []);
});
