/**
 * In-memory development backend for the Voxel+ Cloud API.
 *
 * Implements the subset of the @supabase/supabase-js client surface the API
 * uses (from().select/insert/update/upsert/delete with eq/in/ilike filters,
 * order/limit/range, maybeSingle/single, rpc, and a stubbed storage bucket)
 * so the entire cloud service — identity, profiles, library, cosmetics,
 * achievements, instances, ads, VPacks, owner panel — runs locally with ZERO
 * credentials. Contributors clone, `npm run dev`, done.
 *
 * This module is dev/test infrastructure only; production uses the real
 * Supabase Postgres backend selected in store.ts. No data persists between
 * restarts — that is the point of the mock mode.
 */
import { randomUUID } from 'node:crypto';
import { DEV_SEED } from './devSeed.js';

type Row = Record<string, any>;
type Filter = [string, string, any];

function getField(row: Row, col: string): any {
  const parts = col.split('->>');
  let v: any = row;
  for (const p of parts) v = v?.[p];
  return v;
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  let out = rows.slice();
  for (const [op, col, val] of filters) {
    if (op === 'eq') out = out.filter(r => getField(r, col) === val);
    else if (op === 'neq') out = out.filter(r => getField(r, col) !== val);
    else if (op === 'is') out = out.filter(r => val === null ? getField(r, col) === null || getField(r, col) === undefined : getField(r, col) === val);
    else if (op === 'in') out = out.filter(r => (val as any[]).includes(getField(r, col)));
    else if (op === 'ilike') {
      const needle = String(val).replace(/%/g, '').toLowerCase();
      out = out.filter(r => String(getField(r, col) ?? '').toLowerCase().includes(needle));
    }
    else if (op === 'not' && col === 'in') {
      // .not('id', 'in', '(1,2)') — parsed value arrives as a string tuple
      const ids = String(val).replace(/^\(|\)$/g, '').split(',').map(s => s.trim());
      out = out.filter(r => !ids.includes(String(r.id)));
    }
  }
  return out;
}

interface OrderSpec { col: string; ascending: boolean }

class QueryBuilder {
  private filters: Filter[] = [];
  private orders: OrderSpec[] = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

  constructor(
    private store: MemoryDataClient,
    private table: string,
    private op: 'read' | 'insert' | 'update' | 'upsert' | 'delete',
    private payload?: any,
    private upsertOpts?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) {}

  select(_cols?: string, _opts?: any): this { return this; }
  eq(col: string, val: any): this { this.filters.push(['eq', col, val]); return this; }
  neq(col: string, val: any): this { this.filters.push(['neq', col, val]); return this; }
  is(col: string, val: any): this { this.filters.push(['is', col, val]); return this; }
  in(col: string, vals: any[]): this { this.filters.push(['in', col, vals]); return this; }
  ilike(col: string, val: string): this { this.filters.push(['ilike', col, val]); return this; }
  not(col: string, op: string, val: any): this { this.filters.push(['not', col === 'in' ? 'in' : col, val]); return this; }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, ascending: opts?.ascending !== false }); return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  range(from: number, to: number): this { this.rangeFrom = from; this.rangeTo = to; return this; }
  maybeSingle(): Promise<{ data: Row | null; error: any }> {
    this.singleMode = 'maybeSingle';
    return this.exec() as any;
  }
  single(): Promise<{ data: Row | null; error: any }> {
    this.singleMode = 'single';
    return this.exec() as any;
  }

  private applyShape(rows: Row[]): Row[] {
    let out = rows;
    for (const o of this.orders) {
      out = out.slice().sort((a, b) => {
        const av = getField(a, o.col), bv = getField(b, o.col);
        const cmp = av === bv ? 0 : (av < bv ? -1 : 1);
        return o.ascending ? cmp : -cmp;
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) {
      out = out.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitN !== null) {
      out = out.slice(0, this.limitN);
    }
    return out;
  }

  private exec(): Promise<{ data: any; error: any }> {
    const table = this.store._table(this.table);

    if (this.op === 'read') {
      const rows = this.applyShape(applyFilters(table, this.filters));
      if (this.singleMode === 'single' || this.singleMode === 'maybeSingle') {
        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : (this.singleMode === 'single' ? { message: 'not found' } : null) });
      }
      return Promise.resolve({ data: rows, error: null });
    }

    if (this.op === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: Row[] = [];
      for (const item of items) {
        const row = { ...item };
        if (!row.id) row.id = randomUUID();
        const duplicateAccountKey = this.table === 'voxel_accounts' && table.some(r =>
          (row.public_key_id && r.public_key_id === row.public_key_id) ||
          (row.username_normalized && r.username_normalized === row.username_normalized)
        );
        if (table.some(r => r.id === row.id) || duplicateAccountKey) {
          return Promise.resolve({ data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${this.table}_pkey"` } });
        }
        table.push(row);
        inserted.push(row);
      }
      return this.finishWrite(inserted);
    }

    if (this.op === 'upsert') {
      const conflictCols = (this.upsertOpts?.onConflict || 'id').split(',').map(s => s.trim());
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const written: Row[] = [];
      for (const item of items) {
        const existing = table.find(r => conflictCols.every(col => getField(r, col) === getField(item, col)));
        if (existing) {
          if (!this.upsertOpts?.ignoreDuplicates) Object.assign(existing, item);
          written.push(existing);
        } else {
          const row = { ...item };
          if (!row.id) row.id = randomUUID();
          table.push(row);
          written.push(row);
        }
      }
      return this.finishWrite(written);
    }

    if (this.op === 'update') {
      const matched = applyFilters(table, this.filters);
      for (const row of matched) Object.assign(row, this.payload);
      return this.finishWrite(matched);
    }

    // delete
    const matched = applyFilters(table, this.filters);
    for (const row of matched) table.splice(table.indexOf(row), 1);
    return this.finishWrite(matched);
  }

  private finishWrite(rows: Row[]): Promise<{ data: any; error: any }> {
    // PostgREST returns null unless .select()/.single() was chained after the
    // write; our routes only read the error or a row via .single()/.maybeSingle().
    if (this.singleMode === 'single' || this.singleMode === 'maybeSingle') {
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  then(res: (v: { data: any; error: any }) => any, rej?: (e: any) => any) {
    return this.exec().then(res, rej);
  }
}

class MemoryStorageBucket {
  private files = new Map<string, Buffer>();
  constructor(private bucket: string) {}
  upload(path: string, body: Buffer | Uint8Array | any, _opts?: any) {
    this.files.set(path, Buffer.from(body));
    return Promise.resolve({ data: { path }, error: null });
  }
  getPublicUrl(path: string) {
    return { data: { publicUrl: `memory://storage/${this.bucket}/${path}` } };
  }
  list(prefix?: string) {
    const names = [...this.files.keys()]
      .filter(k => !prefix || k.startsWith(prefix + '/') || k === prefix)
      .map(k => ({ name: prefix ? k.slice(prefix.length + 1) : k }));
    return Promise.resolve({ data: names, error: null });
  }
  remove(paths: string[]) {
    for (const p of paths) this.files.delete(p);
    return Promise.resolve({ data: null, error: null });
  }
}

/**
 * In-memory stand-in for the service-role Supabase client. Same object
 * shape — from(), rpc(), storage — so route code is identical in dev and
 * production.
 */
export class MemoryDataClient {
  private tables = new Map<string, Row[]>();
  private buckets = new Map<string, MemoryStorageBucket>();

  _table(name: string): Row[] {
    let t = this.tables.get(name);
    if (!t) { t = []; this.tables.set(name, t); }
    return t;
  }

  from(table: string) {
    const self = this;
    return {
      select: (cols?: string, opts?: any) => new QueryBuilder(self, table, 'read').select(cols, opts),
      insert: (payload: any) => new QueryBuilder(self, table, 'insert', payload),
      upsert: (payload: any, opts?: any) => new QueryBuilder(self, table, 'upsert', payload, opts),
      update: (payload: any) => new QueryBuilder(self, table, 'update', payload),
      delete: () => new QueryBuilder(self, table, 'delete')
    };
  }

  /** JS implementations of the deployed Postgres RPCs. */
  rpc(fn: string, args?: any): Promise<{ data: any; error: any }> {
    if (fn === 'get_public_user_profiles') {
      const target = args?.target_username ? String(args.target_username).toLowerCase() : null;
      let users = this._table('voxel_users').filter(r => r.is_public);
      if (target) users = users.filter(r => String(r.username).toLowerCase() === target);
      const rows = users.map(u => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        avatar_url: u.avatar_url,
        bio: u.bio,
        is_creator: !!u.is_creator,
        created_at: u.created_at,
        public_packs_count: this._table('voxel_library').filter(l => l.user_id === u.id && l.type === 'pack' && l.metadata?.isPublic === 'true').length,
        public_skins_count: this._table('voxel_library').filter(l => l.user_id === u.id && l.type === 'skin' && l.metadata?.isPublic === 'true').length
      }));
      return Promise.resolve({ data: rows, error: null });
    }
    if (fn === 'get_user_admin_profile') {
      const u = this._table('voxel_users').find(r => r.id === args?.target_user_id);
      if (!u) return Promise.resolve({ data: null, error: { message: 'User not found' } });
      return Promise.resolve({
        data: {
          id: u.id,
          username: u.username,
          avatar: u.avatar,
          avatar_url: u.avatar_url,
          bio: u.bio,
          is_public: u.is_public,
          is_creator: u.is_creator,
          created_at: u.created_at,
          library_count: this._table('voxel_library').filter(l => l.user_id === u.id).length,
          achievements_count: this._table('voxel_user_achievements').filter(a => a.user_id === u.id).length,
          role: this._table('voxel_owner_roles').find(r => r.user_id === u.id)?.role ?? null
        },
        error: null
      });
    }
    return Promise.resolve({ data: null, error: { message: `rpc ${fn} not implemented in memory backend` } });
  }

  storage = {
    from: (bucket: string) => {
      let b = this.buckets.get(bucket);
      if (!b) { b = new MemoryStorageBucket(bucket); this.buckets.set(bucket, b); }
      return b;
    }
  };

  /** Pre-populate catalog tables so a dev clone works end-to-end. */
  seedDevData(): void {
    for (const [table, rows] of Object.entries(DEV_SEED)) {
      const t = this._table(table);
      for (const row of rows) {
        if (!t.some(r => r.id === row.id)) t.push({ ...row });
      }
    }
  }

  /** Test helper: wipe all tables. */
  reset(): void {
    this.tables.clear();
    this.buckets.clear();
  }
}

/** A shared client for `VOXELPLUS_DATA_BACKEND=memory` (and tests). */
export const sharedMemoryClient = new MemoryDataClient();
