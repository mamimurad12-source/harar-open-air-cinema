/**
 * Postgres row-locking proofs: the races SQLite used to serialize behind a
 * database-wide write lock must now resolve correctly through `SELECT …
 * FOR UPDATE` + atomic conditional writes. Every test fires genuinely
 * concurrent HTTP requests (Promise.all, no sleeps) and asserts a
 * deterministic end state: exactly one winner, no duplicates, no oversell.
 *
 * Runs against the test-only stub provider — no real rail is ever contacted.
 */
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { VALID_PHONE, authCookie, closeTestDatabases, createTestContext } from './helper';
import { __setAllowlistForTests, __setProvidersForTests } from '../src/services/payments/registry';
import { StubProvider } from './stubProvider';

afterEach(() => closeTestDatabases());

type App = Parameters<typeof request>[0];

async function book(app: App, eventId: string, quantity = 1, phone = VALID_PHONE) {
  const res = await request(app).post('/api/bookings').send({
    eventId,
    customerName: 'Race Guest',
    phone,
    quantity,
  });
  assert.equal(res.status, 201);
  return res.body.booking as {
    bookingReference: string;
    tickets: Array<{ ticketNumber: string; qrToken: string }>;
  };
}

async function adminSession(app: App): Promise<string> {
  const login = await request(app)
    .post('/api/admin/login')
    .send({ email: 'admin@test.local', password: 'test-password-123' });
  assert.equal(login.status, 200);
  const setCookie = login.headers['set-cookie'] as string | string[];
  return ((Array.isArray(setCookie) ? setCookie[0] : setCookie) as string).split(';')[0] as string;
}

let stub: StubProvider;
beforeEach(() => {
  stub = new StubProvider();
  __setProvidersForTests([stub]);
  __setAllowlistForTests(['EBIRR', 'COOPAY', 'CBE', 'TELEBIRR', 'MOBILE_BANKING']);
});
after(() => {
  __setProvidersForTests(null);
  __setAllowlistForTests(undefined);
});

describe('pg-concurrency: payment completion races', () => {
  it('parallel verify pulls complete exactly once (one completed, rest already-paid)', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId);
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'TELEBIRR',
    });

    const attempts = await Promise.all([
      request(app).post(`/api/bookings/${booking.bookingReference}/payment/verify`).send({
        phone: VALID_PHONE,
      }),
      request(app).post(`/api/bookings/${booking.bookingReference}/payment/verify`).send({
        phone: VALID_PHONE,
      }),
    ]);
    assert.ok(attempts.every((r) => r.status === 200));
    const verifications = attempts.map((r) => r.body.verification as string);
    assert.equal(verifications.filter((v) => v === 'completed').length, 1);
    assert.ok(verifications.every((v) => v === 'completed' || v === 'already-paid'));

    const paid = (await db.get<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM payments WHERE status = 'PAID'",
    )) as { n: number };
    assert.equal(paid.n, 1);
    const brow = (await db.get<{ status: string }>(
      'SELECT status FROM bookings WHERE booking_reference = $1',
      [booking.bookingReference],
    )) as { status: string };
    assert.equal(brow.status, 'CONFIRMED');
    const tickets = (await db.all<{ status: string }>(
      'SELECT status FROM tickets WHERE booking_id = (SELECT id FROM bookings WHERE booking_reference = $1)',
      [booking.bookingReference],
    )) as Array<{ status: string }>;
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0]?.status, 'ACTIVE');
  });

  it('parallel duplicate webhooks complete exactly once (one completed, one recorded event)', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId);
    const init = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'CBE' });
    const tx = init.body.payment.providerTransactionId as string;
    const body = JSON.stringify({ transactionId: tx });
    const sig = stub.signWebhook(Buffer.from(body, 'utf8'));
    const post = () =>
      request(app)
        .post('/api/payments/webhook/stub')
        .set('Content-Type', 'application/json')
        .set('x-stub-signature', sig)
        .send(body);

    const [first, second] = await Promise.all([post(), post()]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const outcomes = [first.body.outcome as string, second.body.outcome as string];
    assert.equal(outcomes.filter((o) => o === 'completed').length, 1);
    assert.ok(outcomes.every((o) => o === 'completed' || o === 'already-processed'));

    const events = (await db.get<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM webhook_events',
    )) as { n: number };
    assert.equal(events.n, 1);
    const paid = (await db.get<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM payments WHERE status = 'PAID'",
    )) as { n: number };
    assert.equal(paid.n, 1);
  });

  it('parallel initiations serialize into one PENDING payment row (last writer wins)', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId);
    const post = () =>
      request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
        paymentMethod: 'EBIRR',
      });

    const [first, second] = await Promise.all([post(), post()]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const txs = new Set([
      first.body.payment.providerTransactionId as string,
      second.body.payment.providerTransactionId as string,
    ]);
    assert.equal(txs.size, 2); // distinct provider references per attempt

    const rows = (await db.all<{ provider_transaction_id: string; status: string }>(
      'SELECT provider_transaction_id, status FROM payments',
    )) as Array<{ provider_transaction_id: string; status: string }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, 'PENDING');
    assert.ok(txs.has(rows[0]?.provider_transaction_id ?? ''));
  });
});

describe('pg-concurrency: gate race', () => {
  it('parallel scans of one ticket admit exactly one guest', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId);
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'TELEBIRR',
    });
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment/verify`).send({
      phone: VALID_PHONE,
    });
    const cookie = await adminSession(app);
    const token = booking.tickets[0]?.qrToken ?? '';
    const scan = () =>
      request(app).post('/api/admin/tickets/validate').set(authCookie(cookie)).send({ token });

    const [first, second] = await Promise.all([scan(), scan()]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const outcomes = [
      first.body.validation.outcome as string,
      second.body.validation.outcome as string,
    ];
    assert.equal(outcomes.filter((o) => o === 'VALID').length, 1);
    assert.ok(outcomes.every((o) => o === 'VALID' || o === 'ALREADY_USED'));

    const row = (await db.get<{ status: string }>(
      'SELECT status FROM tickets WHERE qr_token = $1',
      [token],
    )) as { status: string };
    assert.equal(row.status, 'USED');
  });
});
