/**
 * Phase 3.5 production-readiness audit: adversarial verification of the
 * payment state machine. Every test attacks a bypass vector (tampered
 * amounts, methods, references, webhooks, replays) and asserts the money
 * state cannot move without genuine provider evidence.
 *
 * Runs over HTTP against the test-only stub provider — no real rail is
 * ever contacted and no provider response is faked.
 */
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { VALID_PHONE, authCookie, closeTestDatabases, createTestContext } from './helper';
import { __setAllowlistForTests, __setProvidersForTests } from '../src/services/payments/registry';
import { StubProvider } from './stubProvider';

afterEach(() => closeTestDatabases());

type App = Parameters<typeof request>[0];

async function adminSession(app: App): Promise<string> {
  const login = await request(app)
    .post('/api/admin/login')
    .send({ email: 'admin@test.local', password: 'test-password-123' });
  assert.equal(login.status, 200);
  const setCookie = login.headers['set-cookie'] as string | string[];
  return ((Array.isArray(setCookie) ? setCookie[0] : setCookie) as string).split(';')[0] as string;
}

async function book(app: App, eventId: string, quantity = 2, phone = VALID_PHONE) {
  const res = await request(app).post('/api/bookings').send({
    eventId,
    customerName: 'Audit Guest',
    phone,
    quantity,
  });
  assert.equal(res.status, 201);
  return res.body.booking as {
    bookingReference: string;
    totalAmount: number;
    tickets: Array<{ ticketNumber: string; qrToken: string }>;
  };
}

async function initiate(app: App, ref: string, method = 'TELEBIRR', extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/bookings/${ref}/payment`)
    .send({ paymentMethod: method, ...extra });
  assert.equal(res.status, 201);
  return res.body.payment as { providerTransactionId: string; amount: number; currency: string };
}

async function statusOf(app: App, ref: string, phone = VALID_PHONE) {
  const res = await request(app).get(`/api/bookings/${ref}/payment`).query({ phone });
  assert.equal(res.status, 200);
  return res.body as {
    booking: { status: string; paymentStatus: string };
    payment: { status: string; amount: number; currency: string } | null;
  };
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

describe('audit: amount security (client money input is dead on arrival)', () => {
  it('ignores forged amount/currency/price/total at initiation', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 2); // 2 × 250 = 500
    const payment = await initiate(app, booking.bookingReference, 'CBE', {
      amount: 1,
      currency: 'USD',
      totalAmount: 1,
      ticketPrice: 1,
      total: 1,
    });
    assert.equal(payment.amount, 500);
    assert.equal(payment.currency, 'ETB');
    const row = (await db.get<{ amount: number; currency: string }>(
      'SELECT amount, currency FROM payments',
    )) as { amount: number; currency: string };
    assert.equal(row.amount, 500);
    assert.equal(row.currency, 'ETB');
  });

  it('a webhook body lying about the amount cannot move money (re-query is authoritative)', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 2);
    const payment = await initiate(app, booking.bookingReference, 'EBIRR');
    // Attacker-signed? No — correctly signed, but the BODY claims a jackpot.
    const lyingBody = JSON.stringify({
      transactionId: payment.providerTransactionId,
      amount: '999999.00',
      currency: 'ETB',
      status: 'success',
    });
    const res = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', stub.signWebhook(Buffer.from(lyingBody, 'utf8')))
      .send(lyingBody);
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'completed');
    const row = (await db.get<{ amount: number; currency: string }>(
      'SELECT amount, currency FROM payments',
    )) as { amount: number; currency: string };
    assert.equal(row.amount, 500); // real total, not the body's claim
    assert.equal(row.currency, 'ETB');
  });

  it('provider-reported amount/currency mismatch via webhook fails closed', async () => {
    const { app, db, eventId } = await createTestContext();
    for (const tamper of ['amount', 'currency'] as const) {
      const booking = await book(app, eventId, 1);
      const payment = await initiate(app, booking.bookingReference, 'COOPAY');
      if (tamper === 'amount') stub.amounts.set(payment.providerTransactionId, 1);
      else stub.currencies.set(payment.providerTransactionId, 'USD');
      const body = JSON.stringify({ transactionId: payment.providerTransactionId });
      const res = await request(app)
        .post('/api/payments/webhook/stub')
        .set('Content-Type', 'application/json')
        .set('x-stub-signature', stub.signWebhook(Buffer.from(body, 'utf8')))
        .send(body);
      assert.equal(res.body.outcome, 'failed-recorded');
      const view = await statusOf(app, booking.bookingReference);
      assert.equal(view.payment?.status, 'FAILED');
      assert.equal(view.booking.status, 'PENDING'); // retryable, never activated
      const active = (await db.get<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM tickets WHERE booking_id = (SELECT id FROM bookings WHERE booking_reference = $1) AND status = 'ACTIVE'`,
        [booking.bookingReference],
      )) as { n: number };
      assert.equal(active.n, 0);
    }
  });
});

describe('audit: webhook security (zero trust at the boundary)', () => {
  it('rejects missing signature, tampered body, and tampered signature without state change', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const payment = await initiate(app, booking.bookingReference, 'TELEBIRR');
    const goodBody = JSON.stringify({ transactionId: payment.providerTransactionId });

    const missing = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .send(goodBody);
    assert.equal(missing.status, 401);

    const tamperedBody = JSON.stringify({ transactionId: payment.providerTransactionId, admin: true });
    const modified = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', stub.signWebhook(Buffer.from(goodBody, 'utf8')))
      .send(tamperedBody);
    assert.equal(modified.status, 401);

    const badSig = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', '0'.repeat(64))
      .send(goodBody);
    assert.equal(badSig.status, 401);

    const view = await statusOf(app, booking.bookingReference);
    assert.equal(view.payment?.status, 'PENDING');
    assert.equal(view.booking.status, 'PENDING');
  });

  it('replayed webhooks complete exactly once', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const payment = await initiate(app, booking.bookingReference, 'CBE');
    const body = JSON.stringify({ transactionId: payment.providerTransactionId });
    const sig = stub.signWebhook(Buffer.from(body, 'utf8'));
    const outcomes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/payments/webhook/stub')
        .set('Content-Type', 'application/json')
        .set('x-stub-signature', sig)
        .send(body);
      assert.equal(res.status, 200);
      outcomes.push(res.body.outcome as string);
    }
    assert.deepEqual(outcomes, ['completed', 'already-processed', 'already-processed']);
    const events = (await db.get<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM webhook_events',
    )) as { n: number };
    assert.equal(events.n, 1);
    const paid = (await db.get<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM payments WHERE status = 'PAID'",
    )) as { n: number };
    assert.equal(paid.n, 1);
  });

  it('unknown transactions are recorded and ignored (no state anywhere)', async () => {
    const { app, db, eventId } = await createTestContext();
    await book(app, eventId, 1);
    const body = JSON.stringify({ transactionId: 'hoc-FORGED-0000' });
    const res = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', stub.signWebhook(Buffer.from(body, 'utf8')))
      .send(body);
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'ignored');
    const payments = (await db.get<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM payments',
    )) as { n: number };
    assert.equal(payments.n, 0);
    const events = (await db.get<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM webhook_events',
    )) as { n: number };
    assert.equal(events.n, 1); // kept for ops review
  });
});

describe('audit: reference + method tampering', () => {
  it("one guest's phone cannot read or verify another guest's booking", async () => {
    const { app, eventId } = await createTestContext();
    const a = await book(app, eventId, 1, '0911111111');
    await book(app, eventId, 1, '0911222222');
    await initiate(app, a.bookingReference, 'TELEBIRR');

    const read = await request(app)
      .get(`/api/bookings/${a.bookingReference}/payment`)
      .query({ phone: '0911222222' });
    assert.equal(read.status, 404);
    const verify = await request(app)
      .post(`/api/bookings/${a.bookingReference}/payment/verify`)
      .send({ phone: '0911222222' });
    assert.equal(verify.status, 404);
    const view = await statusOf(app, a.bookingReference, '0911111111');
    assert.equal(view.payment?.status, 'PENDING');
  });

  it('rejects non-canonical and unknown methods (strict enum, no coercion)', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    for (const method of ['telebirr', 'Telebirr', ' TELEBIRR', 'VISA', '', null, 42, {}]) {
      const res = await request(app)
        .post(`/api/bookings/${booking.bookingReference}/payment`)
        .send({ paymentMethod: method });
      assert.equal(res.status, 400, `method ${JSON.stringify(method)} must be rejected`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('polling status and hitting callbacks can never pay', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    await initiate(app, booking.bookingReference, 'EBIRR');
    for (let i = 0; i < 3; i++) {
      const view = await statusOf(app, booking.bookingReference);
      assert.equal(view.payment?.status, 'PENDING');
      assert.equal(view.booking.paymentStatus, 'UNPAID');
    }
    for (let i = 0; i < 2; i++) {
      const cb = await request(app)
        .get('/api/payments/callback/stub')
        .query({ trx_ref: 'whatever', status: 'success' })
        .redirects(0);
      assert.equal(cb.status, 302);
    }
    const view = await statusOf(app, booking.bookingReference);
    assert.equal(view.payment?.status, 'PENDING');
    assert.equal(view.booking.status, 'PENDING');
  });
});

describe('audit: expiry releases seats but never touches paid bookings', () => {
  it('stale PENDING sweep: booking EXPIRED, tickets CANCELLED, seats freed, payment EXPIRED', async () => {
    const { app, db, eventId } = await createTestContext({ capacity: 10 });
    const booking = await book(app, eventId, 4);
    await initiate(app, booking.bookingReference, 'CBE');
    await db.run('UPDATE bookings SET expires_at = $1 WHERE booking_reference = $2', [
      new Date(Date.now() - 60_000).toISOString(),
      booking.bookingReference,
    ]);
    await request(app).get(`/api/events/${eventId}`); // read path triggers the sweep
    const brow = (await db.get<{ status: string; payment_status: string }>(
      'SELECT status, payment_status FROM bookings WHERE booking_reference = $1',
      [booking.bookingReference],
    )) as { status: string; payment_status: string };
    assert.equal(brow.status, 'EXPIRED');
    assert.equal(brow.payment_status, 'UNPAID');
    const tickets = (await db.all<{ status: string }>(
      `SELECT status FROM tickets WHERE booking_id = (SELECT id FROM bookings WHERE booking_reference = $1)`,
      [booking.bookingReference],
    )) as Array<{ status: string }>;
    assert.equal(tickets.length, 4);
    assert.ok(tickets.every((t) => t.status === 'CANCELLED'));
    const prow = (await db.get<{ status: string }>('SELECT status FROM payments')) as {
      status: string;
    };
    assert.equal(prow.status, 'EXPIRED');
    const event = (await db.get<{ reserved_seats: number }>(
      'SELECT reserved_seats FROM events WHERE id = $1',
      [eventId],
    )) as { reserved_seats: number };
    assert.equal(event.reserved_seats, 0);
  });

  it('PAID + CONFIRMED bookings are immune to expiry, even with a past deadline', async () => {
    const { app, db, eventId } = await createTestContext({ capacity: 10 });
    const booking = await book(app, eventId, 2);
    await initiate(app, booking.bookingReference, 'MOBILE_BANKING');
    const verified = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(verified.body.verification, 'completed');
    await db.run('UPDATE bookings SET expires_at = $1 WHERE booking_reference = $2', [
      new Date(Date.now() - 60_000).toISOString(),
      booking.bookingReference,
    ]);
    await request(app).get('/api/events');
    await request(app).get(`/api/bookings/${booking.bookingReference}/payment`).query({
      phone: VALID_PHONE,
    });
    const brow = (await db.get<{ status: string; payment_status: string }>(
      'SELECT status, payment_status FROM bookings WHERE booking_reference = $1',
      [booking.bookingReference],
    )) as { status: string; payment_status: string };
    assert.equal(brow.status, 'CONFIRMED');
    assert.equal(brow.payment_status, 'PAID');
    const event = (await db.get<{ reserved_seats: number }>(
      'SELECT reserved_seats FROM events WHERE id = $1',
      [eventId],
    )) as { reserved_seats: number };
    assert.equal(event.reserved_seats, 2);
  });
});

describe('audit: QR gates on verified payment only', () => {
  it('FAILED payments and EXPIRED bookings never validate', async () => {
    const { app, db, eventId } = await createTestContext();
    const cookie = await adminSession(app);

    const failed = await book(app, eventId, 1);
    const payment = await initiate(app, failed.bookingReference, 'TELEBIRR');
    stub.verdicts.set(payment.providerTransactionId, 'FAILED');
    await request(app).post(`/api/bookings/${failed.bookingReference}/payment/verify`).send({
      phone: VALID_PHONE,
    });
    const failedScan = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(cookie))
      .send({ token: failed.tickets[0]?.qrToken ?? '' });
    assert.equal(failedScan.body.validation.outcome, 'INVALID');
    assert.equal(failedScan.body.validation.paymentPending, true);

    const stale = await book(app, eventId, 1);
    await db.run('UPDATE bookings SET expires_at = $1 WHERE booking_reference = $2', [
      new Date(Date.now() - 60_000).toISOString(),
      stale.bookingReference,
    ]);
    await request(app).get(`/api/events/${eventId}`); // sweep expires it
    const staleScan = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(cookie))
      .send({ token: stale.tickets[0]?.qrToken ?? '' });
    assert.equal(staleScan.body.validation.outcome, 'CANCELLED');
  });
});

describe('audit: initiation + ledger idempotency and completeness', () => {
  it('repeated initiation reuses the single payment row (no duplicates)', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const first = await initiate(app, booking.bookingReference, 'TELEBIRR');
    const second = await initiate(app, booking.bookingReference, 'TELEBIRR');
    assert.notEqual(first.providerTransactionId, second.providerTransactionId);
    const rows = (await db.get<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM payments',
    )) as { n: number };
    assert.equal(rows.n, 1);
  });

  it('ledger exposes every required field and no secret-shaped data', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    await initiate(app, booking.bookingReference, 'CBE');
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment/verify`).send({
      phone: VALID_PHONE,
    });
    const cookie = await adminSession(app);
    const res = await request(app).get('/api/admin/payments').set(authCookie(cookie));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    const item = res.body.payments[0] as Record<string, unknown>;
    for (const key of [
      'bookingReference',
      'paymentMethod',
      'provider',
      'amount',
      'currency',
      'providerReference',
      'status',
      'createdAt',
      'verifiedAt',
    ]) {
      assert.ok(key in item, `ledger item must include ${key}`);
    }
    assert.equal(item.bookingReference, booking.bookingReference);
    assert.equal(item.status, 'PAID');
    assert.ok(item.verifiedAt);
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const needle of ['secret', 'chapubk', 'chaseck', 'bearer', 'password', 'private_key']) {
      assert.equal(serialized.includes(needle), false, `ledger must not leak ${needle}`);
    }
  });
});
