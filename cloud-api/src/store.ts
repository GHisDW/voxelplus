import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { MemoryDataStore, sharedMemoryStore } from './memoryStore.js';

const { Pool } = pg;
type Row = Record<string, any>;
type Backend = 'memory' | 'sqlite' | 'postgres';

export interface DataStore {
  table(name: string): any;
  transaction<T>(work: (store: DataStore) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
  storage?: any;
}

export interface TableQuery {
  select(columns?: string, options?: any): TableQuery;
  eq(column: string, value: any): TableQuery;
  neq(column: string, value: any): TableQuery;
  is(column: string, value: any): TableQuery;
  in(column: string, values: any[]): TableQuery;
  ilike(column: string, value: string): TableQuery;
  not(column: string, operator: string, value: any): TableQuery;
  order(column: string, options?: { ascending?: boolean }): TableQuery;
  limit(value: number): TableQuery;
  range(from: number, to: number): TableQuery;
  maybeSingle(): Promise<{ data: Row | null; error: any }>;
  single(): Promise<{ data: Row | null; error: any }>;
  insert(payload: Row | Row[]): TableQuery;
  update(payload: Row): TableQuery;
  upsert(payload: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): TableQuery;
  delete(): TableQuery;
  then(resolve: (value: { data: any; error: any }) => any, reject?: (reason: any) => any): Promise<any>;
}

interface SqlExecutor {
  query(sql: string, params?: any[]): Promise<{ rows: Row[]; rowCount: number }>;
  exec(sql: string): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

function decodeRow(row: Row): Row {
  const out: Row = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string' && (key === 'metadata' || key === 'contents' || key === 'details' || key === 'sync_payload')) {
      try { out[key] = JSON.parse(value); } catch { /* plain text */ }
    }
  }
  return out;
}

function encodeValue(key: string, value: any): any {
  if (value !== null && typeof value === 'object' && (key === 'metadata' || key === 'contents' || key === 'details' || key === 'sync_payload')) return JSON.stringify(value);
  return value;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe datastore identifier: ${identifier}`);
  return `"${identifier}"`;
}

class SqlTableQuery implements TableQuery {
  private operation: 'read' | 'insert' | 'update' | 'upsert' | 'delete' = 'read';
  private payload: any;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private columns = '*';
  private filters: Array<{ sql: string; values: any[] }> = [];
  private ordering: string[] = [];
  private limitValue: number | null = null;
  private rangeValue: { from: number; to: number } | null = null;
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

  constructor(private executor: SqlExecutor, private tableName: string) {}
  select(columns = '*'): this { this.columns = columns; return this; }
  eq(column: string, value: any): this { this.where(column, '=', value); return this; }
  neq(column: string, value: any): this { this.where(column, '<>', value); return this; }
  is(column: string, value: any): this { this.filters.push({ sql: `${quoteIdentifier(column)} IS ${value === null ? 'NULL' : 'NOT NULL'}`, values: [] }); return this; }
  in(column: string, values: any[]): this { this.filters.push({ sql: `${quoteIdentifier(column)} IN (${values.map(() => '?').join(',') || 'NULL'})`, values }); return this; }
  ilike(column: string, value: string): this { this.filters.push({ sql: `LOWER(${quoteIdentifier(column)}) LIKE LOWER(?)`, values: [value] }); return this; }
  not(column: string, operator: string, value: any): this {
    if (operator === 'in') {
      const values = String(value).replace(/^\(|\)$/g, '').split(',').map(v => v.trim()).filter(Boolean);
      this.filters.push({ sql: `${quoteIdentifier(column)} NOT IN (${values.map(() => '?').join(',') || 'NULL'})`, values });
    }
    return this;
  }
  order(column: string, options?: { ascending?: boolean }): this { this.ordering.push(`${quoteIdentifier(column)} ${options?.ascending === false ? 'DESC' : 'ASC'}`); return this; }
  limit(value: number): this { this.limitValue = value; return this; }
  range(from: number, to: number): this { this.rangeValue = { from, to }; return this; }
  insert(payload: Row | Row[]): this { this.operation = 'insert'; this.payload = payload; return this; }
  update(payload: Row): this { this.operation = 'update'; this.payload = payload; return this; }
  upsert(payload: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): this { this.operation = 'upsert'; this.payload = payload; this.upsertOptions = options || {}; return this; }
  delete(): this { this.operation = 'delete'; return this; }
  maybeSingle(): Promise<{ data: Row | null; error: any }> { this.singleMode = 'maybeSingle'; return this.execute(); }
  single(): Promise<{ data: Row | null; error: any }> { this.singleMode = 'single'; return this.execute(); }
  then(resolve: (value: { data: any; error: any }) => any, reject?: (reason: any) => any): Promise<any> { return this.execute().then(resolve, reject); }
  private where(column: string, operator: string, value: any): void { this.filters.push({ sql: `${quoteIdentifier(column)} ${operator} ?`, values: [value] }); }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      if (this.operation === 'read') {
        const params: any[] = [];
        const where = this.filters.length ? ` WHERE ${this.filters.map(f => { params.push(...f.values); return f.sql; }).join(' AND ')}` : '';
        const order = this.ordering.length ? ` ORDER BY ${this.ordering.join(', ')}` : '';
        let paging = '';
        if (this.rangeValue) { paging = ' LIMIT ? OFFSET ?'; params.push(this.rangeValue.to - this.rangeValue.from + 1, this.rangeValue.from); }
        else if (this.limitValue !== null) { paging = ' LIMIT ?'; params.push(this.limitValue); }
        const selected = this.columns === '*' ? '*' : this.columns.split(',').map(c => quoteIdentifier(c.trim())).join(', ');
        const result = await this.executor.query(`SELECT ${selected} FROM ${quoteIdentifier(this.tableName)}${where}${order}${paging}`, params);
        const rows = result.rows.map(decodeRow);
        if (this.singleMode !== 'none') return { data: rows[0] ?? null, error: rows[0] ? null : (this.singleMode === 'single' ? { message: 'not found' } : null) };
        return { data: rows, error: null };
      }
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      if (this.operation === 'insert' || this.operation === 'upsert') {
        const written: Row[] = [];
        for (const input of rows) {
          const row = { ...input };
          if (!row.id) row.id = crypto.randomUUID();
          const keys = Object.keys(row);
          const values = keys.map(key => encodeValue(key, row[key]));
          const placeholders = keys.map(() => '?').join(', ');
          const cols = keys.map(quoteIdentifier).join(',');
          if (this.operation === 'upsert' && this.upsertOptions.onConflict) {
            const conflicts = this.upsertOptions.onConflict.split(',').map(v => quoteIdentifier(v.trim()));
            if (this.upsertOptions.ignoreDuplicates) await this.executor.query(`INSERT INTO ${quoteIdentifier(this.tableName)} (${cols}) VALUES (${placeholders}) ON CONFLICT (${conflicts.join(',')}) DO NOTHING`, values);
            else {
              const updates = keys.filter(k => !conflicts.includes(quoteIdentifier(k))).map(k => `${quoteIdentifier(k)}=excluded.${quoteIdentifier(k)}`).join(',');
              await this.executor.query(`INSERT INTO ${quoteIdentifier(this.tableName)} (${cols}) VALUES (${placeholders}) ON CONFLICT (${conflicts.join(',')}) DO UPDATE SET ${updates || `${quoteIdentifier(keys[0])}=excluded.${quoteIdentifier(keys[0])}`}`, values);
            }
          } else await this.executor.query(`INSERT INTO ${quoteIdentifier(this.tableName)} (${cols}) VALUES (${placeholders})`, values);
          written.push(row);
        }
        return { data: this.singleMode === 'none' ? null : written[0] ?? null, error: null };
      }
      if (this.operation === 'update') {
        const values: any[] = [];
        const sets = Object.keys(this.payload).map(key => { values.push(encodeValue(key, this.payload[key])); return `${quoteIdentifier(key)} = ?`; });
        const where = this.filters.length ? ` WHERE ${this.filters.map(f => { values.push(...f.values); return f.sql; }).join(' AND ')}` : '';
        const result = await this.executor.query(`UPDATE ${quoteIdentifier(this.tableName)} SET ${sets.join(', ')}${where} RETURNING *`, values);
        const out = result.rows.map(decodeRow);
        return { data: this.singleMode === 'none' ? null : out[0] ?? null, error: null };
      }
      const values: any[] = [];
      const where = this.filters.length ? ` WHERE ${this.filters.map(f => { values.push(...f.values); return f.sql; }).join(' AND ')}` : '';
      const result = await this.executor.query(`DELETE FROM ${quoteIdentifier(this.tableName)}${where} RETURNING *`, values);
      const out = result.rows.map(decodeRow);
      return { data: this.singleMode === 'none' ? null : out[0] ?? null, error: null };
    } catch (error: any) { return { data: null, error: { code: error?.code, message: error?.message || String(error) } }; }
  }
}

class SqlDataStore implements DataStore {
  constructor(private executor: SqlExecutor) {}
  table(name: string): TableQuery { return new SqlTableQuery(this.executor, name); }
  async transaction<T>(work: (store: DataStore) => Promise<T>): Promise<T> { await this.executor.begin(); try { const result = await work(this); await this.executor.commit(); return result; } catch (error) { await this.executor.rollback(); throw error; } }
  async close(): Promise<void> { await this.executor.close(); }
}

class SqliteExecutor implements SqlExecutor {
  constructor(private db: DatabaseSync) {}
  async query(sql: string, params: any[] = []): Promise<{ rows: Row[]; rowCount: number }> { const statement = this.db.prepare(sql); if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) { const rows = statement.all(...params) as Row[]; return { rows, rowCount: rows.length }; } const result: any = statement.run(...params); return { rows: [], rowCount: Number(result.changes || 0) }; }
  async exec(sql: string): Promise<void> { this.db.exec(sql); }
  async begin(): Promise<void> { this.db.exec('BEGIN IMMEDIATE'); }
  async commit(): Promise<void> { this.db.exec('COMMIT'); }
  async rollback(): Promise<void> { this.db.exec('ROLLBACK'); }
  async close(): Promise<void> { this.db.close(); }
}

class PostgresExecutor implements SqlExecutor {
  constructor(private pool: pg.Pool) {}
  private client?: pg.PoolClient;
  private next = 1;
  private connection(): pg.Pool | pg.PoolClient { return this.client || this.pool; }
  async query(sql: string, params: any[] = []): Promise<{ rows: Row[]; rowCount: number }> { this.next = 1; const normalized = sql.replace(/\?/g, () => `$${this.next++}`); const result = await this.connection().query(normalized, params); return { rows: result.rows, rowCount: result.rowCount || 0 }; }
  async exec(sql: string): Promise<void> { await this.connection().query(sql); }
  async begin(): Promise<void> { this.client = await this.pool.connect(); await this.client.query('BEGIN'); }
  async commit(): Promise<void> { await this.client?.query('COMMIT'); this.client?.release(); this.client = undefined; }
  async rollback(): Promise<void> { await this.client?.query('ROLLBACK'); this.client?.release(); this.client = undefined; }
  async close(): Promise<void> { await this.pool.end(); }
}

function initializeSqlite(db: DatabaseSync): void { db.exec(readFileSync(resolve(process.cwd(), 'schema', 'sqlite.sql'), 'utf8')); }

let resolved: DataStore | null = null;

export function selectedBackend(): Backend {
  const configured = (process.env.VOXELPLUS_DATA_BACKEND || '').toLowerCase();
  if (configured === 'memory') { if (process.env.NODE_ENV === 'production') throw new Error('MemoryStore is forbidden in production.'); return 'memory'; }
  if (configured === 'sqlite') return 'sqlite';
  if (configured === 'postgres' || configured === 'neon') return 'postgres';
  return process.env.NODE_ENV === 'production' ? 'postgres' : 'sqlite';
}

export function getDataStore(): DataStore {
  if (resolved) return resolved;
  const backend = selectedBackend();
  if (backend === 'memory') { sharedMemoryStore.seedDevData(); resolved = sharedMemoryStore; return resolved; }
  if (backend === 'sqlite') { const filename = resolve(process.env.VOXELPLUS_SQLITE_PATH || 'data/voxelplus.sqlite'); mkdirSync(dirname(filename), { recursive: true }); const db = new DatabaseSync(filename); initializeSqlite(db); resolved = new SqlDataStore(new SqliteExecutor(db)); return resolved; }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Production datastore is not configured. Set DATABASE_URL for the PostgreSQL/Neon backend.');
  const pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX || 10), ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true } });
  resolved = new SqlDataStore(new PostgresExecutor(pool)); return resolved;
}

export function _resetDataStoreForTests(store?: DataStore | null): void { resolved = store === undefined ? null : store; if (store === sharedMemoryStore) sharedMemoryStore.seedDevData(); }
export type { MemoryDataStore };
