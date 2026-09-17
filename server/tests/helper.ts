/**
 * Test harness: isolated app + a FRESH Postgres database per test.
 *
 * Each `createTestContext()` creates `hoc_test_<pid>_<rand>` on the server
 * named by TEST_DATABASE_URL (maintenance db only — nothing is ever written
 * to it), runs migrations, and seeds one admin + one event. Names are unique
 * per process + test, so files can run in parallel safely.
 *
 * Every suite file MUST call `afterEach(() => closeTestDatabases())`: it
 * closes each finished test's pool and DROPs its database (WITH (FORCE), so
 * stragglers can't block the run).
 */
import crypto from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { Pool } from 'pg';
import { createApp } from '../src/app';
import type { RootDb } from '../src/db/connection';
import { hashPassword } from '../src/lib/auth';
import { newId } from '../src/lib/ids';

process.env.NODE_ENV ??= 'test';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is required to run the server test suite ' +
      '(e.g. postgres://harar:harar@localhost:5432/postgres). Each test gets a fresh ' +
      'database created on that server; nothing is ever written to the shared one.',
  );
}

let adminPool: Pool | null = null;
function getAdminPool(): Pool {
  if (!adminPool) {
    adminPool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
    adminPool.on('error', (err) => console.error('[test-db] admin pool error:', err));
  }
  return adminPool;
}

interface TestDatabase {
  db: RootDb;
  name: string;
}

const openTestDatabases = new Set<TestDatabase>();

function checkDbName(name: string): void {
  // Generated names only — never interpolate anything else into DDL.
  if (!/^hoc_test_[0-9]+_[a-f0-9]{16}$/.test(name)) {
    throw new Error(`Refusing to touch database with unexpected name: ${name}`);
  }
}

function testDatabaseUrl(name: string): string {
  const url = new URL(TEST_DATABASE_URL as string);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Close finished tests' pools, drop their databases, reset the admin pool. */
export async function closeTestDatabases(): Promise<void> {
  const pending = [...openTestDatabases];
  openTestDatabases.clear();
  for (const { db, name } of pending) {
    try {
      await db.close();
    } catch {
      /* already closed */
    }
    try {
      await getAdminPool().query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    } catch (err) {
      console.error(`[test-db] could not drop ${name}:`, err);
    }
  }
  if (adminPool) {
    const pool = adminPool;
    adminPool = null;
    await pool.end().catch(() => {});
  }
}

export interface TestContext {
  app: Express;
  db: RootDb;
  eventId: string;
  adminEmail: string;
  adminPassword: string;
  adminCookie: () => Promise<string>;
}

export async function createTestContext(overrides?: {
  capacity?: number;
  ticketPrice?: number;
  status?: string;
}): Promise<TestContext> {
  const name = `hoc_test_${process.pid}_${crypto.randomBytes(8).toString('hex')}`;
  checkDbName(name);
  await getAdminPool().query(`CREATE DATABASE "${name}"`);
  let ctx: { app: Express; db: RootDb };
  try {
    ctx = await createApp({ databaseUrl: testDatabaseUrl(name) });
  } catch (err) {
    await getAdminPool()
      .query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      .catch(() => {});
    throw err;
  }
  const { app, db } = ctx;
  openTestDatabases.add({ db, name });

  const at = new Date().toISOString();
  const eventId = `evt-test-${newId()}`;
  await db.run(
    `INSERT INTO events (id, title, movie_title, movie_poster, movie_trailer, movie_synopsis,
      event_date, start_time, venue_name, venue_location, ticket_price, capacity,
      reserved_seats, free_snack, status, created_at, updated_at)
     VALUES ($1, $2, NULL, NULL, NULL, NULL, $3, $4, $5, $6, $7, $8, 0, 1, $9, $10, $11)`,
    [
      eventId,
      'Test Open Air Cinema',
      '9-1-2019 EC',
      '11:00 LT',
      'Test Museum',
      'Harar, Ethiopia',
      overrides?.ticketPrice ?? 250,
      overrides?.capacity ?? 100,
      overrides?.status ?? 'PUBLISHED',
      at,
      at,
    ],
  );

  const adminEmail = 'admin@test.local';
  const adminPassword = 'test-password-123';
  await db.run(
    'INSERT INTO admin_users (id, name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [newId(), 'Test Admin', adminEmail, await hashPassword(adminPassword), 'ADMIN', at],
  );

  return {
    app,
    db,
    eventId,
    adminEmail,
    adminPassword,
    adminCookie: async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: adminEmail, password: adminPassword });
      if (res.status !== 200) throw new Error(`test login failed: ${res.status}`);
      const setCookie = res.headers['set-cookie'] as string | string[] | undefined;
      const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      if (!raw) throw new Error('test login returned no cookie');
      return raw.split(';')[0] as string;
    },
  };
}

export const VALID_PHONE = '0911000000';

export function authCookie(cookie: string): { Cookie: string } {
  return { Cookie: cookie };
}
