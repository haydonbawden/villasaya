import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';

export type Row = Record<string, unknown>;
export type BindValue = string | number | bigint | null | Uint8Array;
export type Param = BindValue | boolean | undefined | Date;

let db: DatabaseSync | null = null;
let transactionDepth = 0;
const statementCache = new Map<string, StatementSync>();

/**
 * node:sqlite only binds strings, numbers, bigints, buffers and null. Booleans
 * and Dates are common enough in call sites that normalising here is cheaper
 * than remembering to convert at every query.
 */
function normalise(value: Param): BindValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toPlain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const filePath = config.databasePath;
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  return db;
}

/** Used by the test suite to run each case against an isolated in-memory database. */
export function useDatabase(instance: DatabaseSync): void {
  statementCache.clear();
  transactionDepth = 0;
  db = instance;
  db.exec('PRAGMA foreign_keys = ON');
}

export function closeDb(): void {
  statementCache.clear();
  transactionDepth = 0;
  db?.close();
  db = null;
}

// Prepared statements belong to one connection, so the cache is cleared
// whenever the connection is swapped or closed (see useDatabase/closeDb).
function prepare(sql: string): StatementSync {
  const cached = statementCache.get(sql);
  if (cached) return cached;
  const statement = getDb().prepare(sql);
  statementCache.set(sql, statement);
  return statement;
}

export function query<T = Row>(sql: string, params: Param[] = []): T[] {
  return prepare(sql)
    .all(...params.map(normalise))
    .map((row) => toPlain<T>(row));
}

export function queryOne<T = Row>(sql: string, params: Param[] = []): T | null {
  const row = prepare(sql).get(...params.map(normalise));
  return row === undefined ? null : toPlain<T>(row);
}

export function execute(sql: string, params: Param[] = []): { changes: number } {
  const result = prepare(sql).run(...params.map(normalise));
  return { changes: Number(result.changes) };
}

/**
 * Synchronous, re-entrant transaction.
 *
 * node:sqlite is synchronous end to end, so a callback cannot yield
 * mid-transaction and leave the connection open. Nesting is real: a route
 * handler wraps several writes, and a service it calls (creating a villa
 * workspace, say) wraps its own. The outermost call owns BEGIN/COMMIT and
 * inner calls use savepoints, so an inner failure rolls back only its own work
 * and the outer handler can still decide what to do.
 */
export function transaction<T>(fn: () => T): T {
  const connection = getDb();
  const depth = transactionDepth;
  const savepoint = `sp_${depth}`;

  connection.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  transactionDepth = depth + 1;
  try {
    const result = fn();
    connection.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    try {
      connection.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`);
      if (depth > 0) connection.exec(`RELEASE ${savepoint}`);
    } catch {
      // The transaction was already closed; surface the original error.
    }
    throw error;
  } finally {
    transactionDepth = depth;
  }
}

export function migrate(connection: DatabaseSync = getDb()): string[] {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = new Set(
    connection
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const dir = path.join(import.meta.dirname, 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const run: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    connection.exec('BEGIN');
    try {
      connection.exec(sql);
      connection
        .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
        .run(file, new Date().toISOString());
      connection.exec('COMMIT');
    } catch (error) {
      connection.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
    run.push(file);
  }
  return run;
}

/**
 * Allocates the next per-villa sequence number for human-facing references
 * (TASK-14, CLAIM-102). Must be called inside a transaction.
 */
export function nextReference(table: 'tasks' | 'expense_claims', villaId: string): number {
  const row = queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(reference), 0) + 1 AS next FROM ${table} WHERE villa_id = ?`,
    [villaId],
  );
  return row?.next ?? 1;
}
