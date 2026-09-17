/** Test harness: isolated in-memory app + seeded admin/event per test. */
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import type { Db } from '../src/db/connection';
import { hashPassword } from '../src/lib/auth';
import { newId } from '../src/lib/ids';

process.env.NODE_ENV ??= 'test';

export interface TestContext {
  app: Express;
  db: Db;
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
  const { app, db } = createApp({ dbPath: ':memory:' });
  const at = new Date().toISOString();
  const eventId = `evt-test-${newId()}`;
  db.prepare(
    `INSERT INTO events (id, title, movie_title, movie_poster, movie_trailer, movie_synopsis,
      event_date, start_time, venue_name, venue_location, ticket_price, capacity,
      reserved_seats, free_snack, status, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`,
  ).run(
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
  );

  const adminEmail = 'admin@test.local';
  const adminPassword = 'test-password-123';
  db.prepare(
    'INSERT INTO admin_users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(newId(), 'Test Admin', adminEmail, await hashPassword(adminPassword), 'ADMIN', at);

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
