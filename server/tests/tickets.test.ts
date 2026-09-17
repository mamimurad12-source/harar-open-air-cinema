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

async function bookOne(app: App, eventId: string, phone = VALID_PHONE) {
  const res = await request(app).post('/api/bookings').send({
    eventId,
    customerName: 'Gate Guest',
    phone,
    quantity: 1,
  });
  assert.equal(res.status, 201);
  return res.body.booking as {
    bookingReference: string;
    tickets: Array<{ ticketNumber: string; qrToken: string }>;
  };
}

/** Book + pay through the REAL payment pipeline (stub provider, HTTP only). */
async function bookAndPay(app: App, eventId: string, phone = VALID_PHONE) {
  const booking = await bookOne(app, eventId, phone);
  const initiated = await request(app)
    .post(`/api/bookings/${booking.bookingReference}/payment`)
    .send({ paymentMethod: 'TELEBIRR' });
  assert.equal(initiated.status, 201);
  const verified = await request(app)
    .post(`/api/bookings/${booking.bookingReference}/payment/verify`)
    .send({ phone });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.booking.status, 'CONFIRMED');
  assert.equal(verified.body.payment.status, 'PAID');
  return booking;
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

describe('POST /api/admin/tickets/validate', () => {
  it('validates an ACTIVE (paid) ticket and flips it to USED', async () => {
    const { app, db, eventId } = await createTestContext();
    const booking = await bookAndPay(app, eventId);
    const token = booking.tickets[0]?.qrToken ?? '';
    const sessionCookie = await adminSession(app);

    const res = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token });
    assert.equal(res.status, 200);
    assert.equal(res.body.validation.outcome, 'VALID');
    assert.equal(res.body.validation.ticketNumber, booking.tickets[0]?.ticketNumber);
    assert.equal(res.body.validation.paymentPending, false);
    assert.equal(res.body.validation.paymentStatus, 'PAID');
    assert.ok(res.body.validation.validatedAt);

    const row = db.prepare('SELECT status FROM tickets WHERE qr_token = ?').get(token) as {
      status: string;
    };
    assert.equal(row.status, 'USED');
  });

  it('rejects PENDING (unpaid) tickets as INVALID with paymentPending', async () => {
    const { app, eventId } = await createTestContext();
    const booking = await bookOne(app, eventId); // no payment
    const sessionCookie = await adminSession(app);
    const res = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token: booking.tickets[0]?.qrToken ?? '' });
    assert.equal(res.status, 200);
    assert.equal(res.body.validation.outcome, 'INVALID');
    assert.equal(res.body.validation.paymentPending, true);
    assert.match(res.body.validation.message as string, /payment has not been verified/);
  });

  it('accepts the full QR payload from a scanner', async () => {
    const { app, eventId } = await createTestContext();
    const sessionCookie = await adminSession(app);
    const booking = await bookAndPay(app, eventId);
    const payload = `harar-cinema://ticket/${booking.tickets[0]?.qrToken ?? ''}`;
    const res = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token: payload });
    assert.equal(res.status, 200);
    assert.equal(res.body.validation.outcome, 'VALID');
  });

  it('rejects an already-used ticket', async () => {
    const { app, eventId } = await createTestContext();
    const sessionCookie = await adminSession(app);
    const booking = await bookAndPay(app, eventId);
    const token = booking.tickets[0]?.qrToken ?? '';
    const first = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token });
    assert.equal(first.body.validation.outcome, 'VALID');
    const second = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token });
    assert.equal(second.status, 200);
    assert.equal(second.body.validation.outcome, 'ALREADY_USED');
    assert.ok(second.body.validation.validatedAt);
  });

  it('returns INVALID for unknown codes', async () => {
    const { app } = await createTestContext();
    const sessionCookie = await adminSession(app);
    const res = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token: 'hct_doesnotexist000000000000000000' });
    assert.equal(res.status, 200);
    assert.equal(res.body.validation.outcome, 'INVALID');
  });

  it('returns CANCELLED for tickets of cancelled bookings', async () => {
    const { app, db, eventId } = await createTestContext();
    const sessionCookie = await adminSession(app);
    const booking = await bookAndPay(app, eventId);
    db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE booking_reference = ?").run(
      booking.bookingReference,
    );
    const res = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token: booking.tickets[0]?.qrToken ?? '' });
    assert.equal(res.status, 200);
    assert.equal(res.body.validation.outcome, 'CANCELLED');
  });

  it('requires admin authentication', async () => {
    const { app } = await createTestContext();
    const res = await request(app).post('/api/admin/tickets/validate').send({ token: 'x' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('requires a token', async () => {
    const { app } = await createTestContext();
    const sessionCookie = await adminSession(app);
    const res = await request(app)
      .post('/api/admin/tickets/validate')
      .set(authCookie(sessionCookie))
      .send({ token: '' });
    assert.equal(res.status, 400);
  });
});
