/**
 * Phase 3 payment tests. The full pipeline (initiate → verify pull / signed
 * webhook → completion) runs over HTTP against the test-only stub provider —
 * real money rails are never touched and no provider response is faked.
 */
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { VALID_PHONE, authCookie, createTestContext } from './helper';
import { __setAllowlistForTests, __setProvidersForTests } from '../src/services/payments/registry';
import { StubProvider } from './stubProvider';

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
    customerName: 'Pay Test',
    phone,
    quantity,
  });
  assert.equal(res.status, 201);
  return res.body.booking as { bookingReference: string; totalAmount: number };
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

describe('GET /api/payments/methods', () => {
  it('lists the five customer methods with availability + provider', async () => {
    const { app } = await createTestContext();
    const res = await request(app).get('/api/payments/methods');
    assert.equal(res.status, 200);
    const methods = res.body.methods as Array<{ method: string; available: boolean; provider: string }>;
    assert.equal(methods.length, 5);
    assert.deepEqual(
      methods.map((m) => m.method),
      ['EBIRR', 'COOPAY', 'CBE', 'TELEBIRR', 'MOBILE_BANKING'],
    );
    assert.ok(methods.every((m) => m.available && typeof m.provider === 'string'));
  });

  it('marks every method unavailable (coming soon) when no provider is configured', async () => {
    __setProvidersForTests([]);
    const { app } = await createTestContext();
    const res = await request(app).get('/api/payments/methods');
    const methods = res.body.methods as Array<{ available: boolean }>;
    assert.ok(methods.every((m) => m.available === false));
  });

  it('advertises nothing until the operator confirms methods (fail closed)', async () => {
    __setAllowlistForTests(undefined); // real config: PAYMENT_METHODS unset in tests
    const { app } = await createTestContext();
    const res = await request(app).get('/api/payments/methods');
    const methods = res.body.methods as Array<{ available: boolean; provider: string | null }>;
    assert.ok(methods.every((m) => m.available === false && m.provider === null));
  });

  it('restricts advertising AND initiation to the operator allowlist', async () => {
    __setAllowlistForTests(['TELEBIRR']);
    const { app, eventId } = await createTestContext();
    const res = await request(app).get('/api/payments/methods');
    const methods = res.body.methods as Array<{ method: string; available: boolean }>;
    assert.deepEqual(
      methods.filter((m) => m.available).map((m) => m.method),
      ['TELEBIRR'],
    );
    const booking = await book(app, eventId, 1);
    const blocked = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'CBE' });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'PAYMENT_NOT_PAYABLE');
  });
});

describe('POST /api/bookings/:ref/payment (initiate)', () => {
  it('creates a PENDING payment priced server-side and returns checkout info', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 2);
    const res = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'TELEBIRR', amount: 1 }); // client amount ignored
    assert.equal(res.status, 201);
    assert.equal(res.body.payment.status, 'PENDING');
    assert.equal(res.body.payment.paymentMethod, 'TELEBIRR');
    assert.equal(res.body.payment.provider, 'stub');
    assert.equal(res.body.payment.amount, 500);
    assert.equal(res.body.payment.currency, 'ETB');
    assert.ok(res.body.payment.providerTransactionId);
    assert.ok((res.body.checkoutUrl as string).startsWith('https://stub-pay.test/checkout/'));
    // No secrets in the response.
    assert.equal(JSON.stringify(res.body).includes('stub-webhook-secret'), false);

    const row = db
      .prepare('SELECT status, amount FROM payments WHERE booking_id = (SELECT id FROM bookings WHERE booking_reference = ?)')
      .get(booking.bookingReference) as { status: string; amount: number };
    assert.equal(row.status, 'PENDING');
    assert.equal(row.amount, 500);
  });

  it('rejects invalid methods, unknown bookings, and non-payable bookings', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);

    const badMethod = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'VISA' });
    assert.equal(badMethod.status, 400);
    assert.equal(badMethod.body.error.code, 'VALIDATION_ERROR');

    const missing = await request(app)
      .post('/api/bookings/HOC-NOPE01/payment')
      .send({ paymentMethod: 'CBE' });
    assert.equal(missing.status, 404);

    db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE booking_reference = ?").run(
      booking.bookingReference,
    );
    const cancelled = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'CBE' });
    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.body.error.code, 'PAYMENT_NOT_PAYABLE');
  });

  it('expires stale bookings (410) and releases their seats', async () => {
    const { app, db, eventId } = await createTestContext({ capacity: 10 });
    const booking = await book(app, eventId, 3);
    db.prepare('UPDATE bookings SET expires_at = ? WHERE booking_reference = ?').run(
      new Date(Date.now() - 60_000).toISOString(),
      booking.bookingReference,
    );
    const res = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'EBIRR' });
    assert.equal(res.status, 410);
    assert.equal(res.body.error.code, 'BOOKING_EXPIRED');

    const event = db.prepare('SELECT reserved_seats FROM events WHERE id = ?').get(eventId) as {
      reserved_seats: number;
    };
    assert.equal(event.reserved_seats, 0);
  });

  it('refuses initiation when the method has no configured provider', async () => {
    __setProvidersForTests([]);
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const res = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'COOPAY' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PAYMENT_NOT_PAYABLE');
  });

  it('allows a fresh attempt after FAILED and rejects double-pay', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    stub.verdicts.set('__placeholder__', 'FAILED'); // replaced below with real tx
    const first = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'CBE' });
    const tx1 = first.body.payment.providerTransactionId as string;
    stub.verdicts.set(tx1, 'FAILED');
    const failed = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(failed.body.verification, 'failed');
    assert.equal(failed.body.booking.status, 'PENDING'); // retry allowed

    const second = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'CBE' });
    assert.equal(second.status, 201);
    assert.notEqual(second.body.payment.providerTransactionId, tx1);
    const paid = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(paid.body.verification, 'completed');

    const doublePay = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment`)
      .send({ paymentMethod: 'CBE' });
    assert.equal(doublePay.status, 409);
    assert.equal(doublePay.body.error.code, 'ALREADY_PAID');
  });
});

describe('POST /api/bookings/:ref/payment/verify (verify pull)', () => {
  it('completes the lifecycle: PAID → CONFIRMED → tickets ACTIVE', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 2);
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'TELEBIRR',
    });
    const res = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(res.status, 200);
    assert.equal(res.body.verification, 'completed');
    assert.equal(res.body.booking.status, 'CONFIRMED');
    assert.equal(res.body.booking.paymentStatus, 'PAID');
    assert.equal(res.body.payment.status, 'PAID');
    assert.ok(res.body.payment.verifiedAt);
    assert.ok(
      (res.body.booking.tickets as Array<{ status: string }>).every((t) => t.status === 'ACTIVE'),
    );

    // Re-verifying is idempotent — no double completion.
    const again = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(again.body.verification, 'already-paid');
    assert.equal(again.body.booking.status, 'CONFIRMED');

    const paidCount = db.prepare("SELECT COUNT(*) AS n FROM payments WHERE status = 'PAID'").get() as {
      n: number;
    };
    assert.equal(paidCount.n, 1);
  });

  it('fails closed on amount and currency mismatch (no activation)', async () => {
    const { app, eventId } = await createTestContext();
    const a = await book(app, eventId, 1);
    const initA = await request(app).post(`/api/bookings/${a.bookingReference}/payment`).send({
      paymentMethod: 'EBIRR',
    });
    stub.amounts.set(initA.body.payment.providerTransactionId as string, 1);
    const resA = await request(app)
      .post(`/api/bookings/${a.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(resA.body.verification, 'failed');
    assert.equal(resA.body.payment.status, 'FAILED');
    assert.equal(resA.body.booking.status, 'PENDING');
    assert.match(resA.body.payment.failureReason as string, /Amount mismatch/);

    const b = await book(app, eventId, 1);
    const initB = await request(app).post(`/api/bookings/${b.bookingReference}/payment`).send({
      paymentMethod: 'COOPAY',
    });
    stub.currencies.set(initB.body.payment.providerTransactionId as string, 'USD');
    const resB = await request(app)
      .post(`/api/bookings/${b.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(resB.body.verification, 'failed');
    assert.equal(resB.body.booking.status, 'PENDING');
    assert.match(resB.body.payment.failureReason as string, /Currency mismatch/);
  });

  it('keeps PENDING verdicts pending and requires phone match', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const init = await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'CBE',
    });
    stub.verdicts.set(init.body.payment.providerTransactionId as string, 'PENDING');
    const res = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(res.body.verification, 'still-pending');
    assert.equal(res.body.payment.status, 'PENDING');
    assert.equal(res.body.booking.status, 'PENDING');

    const wrongPhone = await request(app)
      .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
      .send({ phone: '0911222333' });
    assert.equal(wrongPhone.status, 404);

    const noPayment = await book(app, eventId, 1);
    const missing = await request(app)
      .post(`/api/bookings/${noPayment.bookingReference}/payment/verify`)
      .send({ phone: VALID_PHONE });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'PAYMENT_NOT_FOUND');
  });
});

describe('GET /api/bookings/:ref/payment (status)', () => {
  it('returns the booking + payment view only with matching phone', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'MOBILE_BANKING',
    });
    const res = await request(app)
      .get(`/api/bookings/${booking.bookingReference}/payment`)
      .query({ phone: VALID_PHONE });
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.bookingReference, booking.bookingReference);
    assert.equal(res.body.payment.paymentMethod, 'MOBILE_BANKING');

    const wrong = await request(app)
      .get(`/api/bookings/${booking.bookingReference}/payment`)
      .query({ phone: '0911222333' });
    assert.equal(wrong.status, 404);
  });
});

describe('POST /api/payments/webhook/:provider', () => {
  function signedPayload(tx: string): { body: string; signature: string } {
    const body = JSON.stringify({ transactionId: tx });
    return { body, signature: stub.signWebhook(Buffer.from(body, 'utf8')) };
  }

  it('completes payment on a valid signed webhook and ignores duplicates', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const init = await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'TELEBIRR',
    });
    const tx = init.body.payment.providerTransactionId as string;
    const { body, signature } = signedPayload(tx);

    const first = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', signature)
      .send(body);
    assert.equal(first.status, 200);
    assert.equal(first.body.outcome, 'completed');

    const status = await request(app)
      .get(`/api/bookings/${booking.bookingReference}/payment`)
      .query({ phone: VALID_PHONE });
    assert.equal(status.body.payment.status, 'PAID');
    assert.equal(status.body.booking.status, 'CONFIRMED');

    const dup = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', signature)
      .send(body);
    assert.equal(dup.status, 200);
    assert.equal(dup.body.outcome, 'already-processed');

    const events = db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get() as { n: number };
    assert.equal(events.n, 1);
  });

  it('rejects tampered signatures and ignores unknown transactions', async () => {
    const { app, eventId } = await createTestContext();
    await book(app, eventId, 1);
    const bad = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', 'deadbeef')
      .send(JSON.stringify({ transactionId: 'hoc-X' }));
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, 'INVALID_SIGNATURE');

    const { body, signature } = signedPayload('hoc-UNKNOWN-0000');
    const unknown = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', signature)
      .send(body);
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.outcome, 'ignored');
  });

  it('records provider-reported failures without activating tickets', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const init = await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'CBE',
    });
    const tx = init.body.payment.providerTransactionId as string;
    stub.verdicts.set(tx, 'FAILED');
    const { body, signature } = signedPayload(tx);
    const res = await request(app)
      .post('/api/payments/webhook/stub')
      .set('Content-Type', 'application/json')
      .set('x-stub-signature', signature)
      .send(body);
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'failed-recorded');

    const status = await request(app)
      .get(`/api/bookings/${booking.bookingReference}/payment`)
      .query({ phone: VALID_PHONE });
    assert.equal(status.body.payment.status, 'FAILED');
    assert.equal(status.body.booking.status, 'PENDING');
  });
});

describe('GET /api/payments/callback/:provider', () => {
  it('redirects to the return page without changing any state', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await book(app, eventId, 1);
    const res = await request(app)
      .get('/api/payments/callback/stub')
      .query({ trx_ref: 'anything', ref_id: 'whatever', status: 'success' })
      .redirects(0);
    assert.equal(res.status, 302);
    assert.match(res.headers.location as string, /\/pay\/return\?provider=stub/);

    const row = db.prepare('SELECT status FROM bookings WHERE booking_reference = ?').get(
      booking.bookingReference,
    ) as { status: string };
    assert.equal(row.status, 'PENDING'); // callback alone never pays
  });
});

describe('GET /api/admin/payments (ledger)', () => {
  it('lists payment attempts with context and requires admin auth', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await book(app, eventId, 2);
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment`).send({
      paymentMethod: 'TELEBIRR',
    });
    await request(app).post(`/api/bookings/${booking.bookingReference}/payment/verify`).send({
      phone: VALID_PHONE,
    });

    const anon = await request(app).get('/api/admin/payments');
    assert.equal(anon.status, 401);

    const cookie = await adminSession(app);
    const res = await request(app).get('/api/admin/payments').set(authCookie(cookie));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    const item = res.body.payments[0] as Record<string, unknown>;
    assert.equal(item.bookingReference, booking.bookingReference);
    assert.equal(item.customerName, 'Pay Test');
    assert.equal(item.amount, 500);
    assert.equal(item.status, 'PAID');
    assert.ok(item.verifiedAt);
    assert.equal(JSON.stringify(res.body).includes('stub-webhook-secret'), false);
  });
});
