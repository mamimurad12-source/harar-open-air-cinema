/**
 * PostgreSQL access layer: a `pg` pool behind a tiny typed wrapper.
 *
 * Three faces, one shape:
 * - `RootDb` — the pool. Plain queries fan out; `transaction()` checks out ONE
 *   client so the whole body runs in a single session.
 * - `Tx` — the transactional client. Same queries plus savepoints (needed
 *   because in Postgres ANY error aborts the enclosing transaction, so the
 *   id/token retry loops must isolate each attempt).
 *
 * Concurrency model (READ COMMITTED + explicit row locks, replacing SQLite's
 * database-wide write lock):
 * - Single-statement conditional writes (seat reserve, ticket flip, guarded
 *   status flips) are atomic — concurrent losers see rowCount 0. Unchanged.
 * - Read-then-write sections lock what they read (`SELECT … FOR UPDATE`) so a
 *   concurrent transaction commits first and the waiter re-reads fresh state.
 * - Opposite lock orders can deadlock (rare, tiny transactions); `transaction`
 *   retries deadlock victims (`40P01`) transparently. Every transaction body
 *   in this codebase is retry-safe (DB writes + randomness only, no network).
 */
import { Pool, type PoolClient } from 'pg';

export interface Db {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
}

export interface Tx extends Db {
  savepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
}

export interface RootDb extends Db {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type QueryTarget = Pool | PoolClient;

async function getOne<T>(target: QueryTarget, sql: string, params?: unknown[]): Promise<T | undefined> {
  const res = await target.query(sql, params as unknown[] | undefined);
  return res.rows[0] as T | undefined;
}

async function getAll<T>(target: QueryTarget, sql: string, params?: unknown[]): Promise<T[]> {
  const res = await target.query(sql, params as unknown[] | undefined);
  return res.rows as T[];
}

async function runStmt(
  target: QueryTarget,
  sql: string,
  params?: unknown[],
): Promise<{ changes: number }> {
  const res = await target.query(sql, params as unknown[] | undefined);
  return { changes: res.rowCount ?? 0 };
}

function checkSavepointName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid savepoint name: ${name}`);
  }
}

class ClientDb implements Tx {
  constructor(private readonly client: PoolClient) {}

  get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return getOne<T>(this.client, sql, params);
  }

  all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return getAll<T>(this.client, sql, params);
  }

  run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    return runStmt(this.client, sql, params);
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  async savepoint(name: string): Promise<void> {
    checkSavepointName(name);
    await this.client.query(`SAVEPOINT "${name}"`);
  }

  async releaseSavepoint(name: string): Promise<void> {
    checkSavepointName(name);
    await this.client.query(`RELEASE SAVEPOINT "${name}"`);
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    checkSavepointName(name);
    await this.client.query(`ROLLBACK TO SAVEPOINT "${name}"`);
  }
}

const DEADLOCK_RETRY_LIMIT = 3;

function isDeadlock(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '40P01';
}

class PoolDb implements RootDb {
  constructor(private readonly pool: Pool) {}

  get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return getOne<T>(this.pool, sql, params);
  }

  all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return getAll<T>(this.pool, sql, params);
  }

  run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    return runStmt(this.pool, sql, params);
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(new ClientDb(client));
        await client.query('COMMIT');
        client.release();
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* connection already dead — release handles it */
        }
        client.release();
        if (isDeadlock(err) && attempt < DEADLOCK_RETRY_LIMIT) continue;
        throw err;
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Opens a pool. Small on purpose: one Render instance + serverless Postgres.
 * Short idle timeout lets Neon-style compute sleep between test sessions.
 * TLS comes from the connection string (`sslmode=require`), exactly as the
 * hosted dashboards issue it; plain local URLs stay unencrypted.
 */
export async function openDatabase(connectionString: string): Promise<RootDb> {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  // Idle-client errors must never crash the process.
  pool.on('error', (err) => {
    console.error('[db] idle pool client error:', err);
  });
  const db = new PoolDb(pool);
  await db.exec('SELECT 1'); // fail fast when the database is unreachable
  return db;
}
