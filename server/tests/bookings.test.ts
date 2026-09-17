import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { VALID_PHONE, createTestContext } from './helper';

interface TicketJson {
  ticketNumber: string;
  qrToken: string;
  status: string;
}
interface BookingJson {
  bookingReference: string;
  quantity: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  tickets: TicketJson[];
}

describe('POST /api/bookings', () => {
  it('creates a pending/unpaid booking with server-calculated total and tickets', async () => {
    const { app, eventId } = await createTestContext();
    const res = await request(app).post('/api/bookings').send({
      eventId,
      customerName: 'Hanna Girma',
      phone: '0911 12 34 56',
      quantity: 2,
      totalAmount: 1, // malicious/buggy client value — must be ignored
    });
    assert.equal(res.status, 201);
    const booking = res.body.booking as BookingJson;
    assert.match(booking.bookingReference, /^HOC-[A-Z2-9]{6}$/);
    assert.equal(booking.status, 'PENDING');
    assert.equal(booking.paymentStatus, 'UNPAID');
    assert.equal(booking.totalAmount, 500);
    assert.equal(booking.tickets.length, 2);
    assert.equal(booking.tickets[0]?.status, 'PENDING');
    assert.match(booking.tickets[0]?.qrToken ?? '', /^hct_[0-9a-f]{32}$/);
  });

  it('decrements availability (capacity calculation)', async () => {
    const { app, eventId } = await createTestContext({ capacity: 100 });
    await request(app)
      .post('/api/bookings')
      .send({ eventId, customerName: 'Ab', phone: VALID_PHONE, quantity: 7 });
    const res = await request(app).get(`/api/events/${eventId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.event.soldSeats, 7);
    assert.equal(res.body.event.availableSeats, 93);
    assert.equal(res.body.event.isSoldOut, false);
  });

  it('rejects booking a sold-out event', async () => {
    const { app, eventId } = await createTestContext({ capacity: 2 });
    const first = await request(app)
      .post('/api/bookings')
      .send({ eventId, customerName: 'Ab', phone: VALID_PHONE, quantity: 2 });
    assert.equal(first.status, 201);
    const res = await request(app)
      .post('/api/bookings')
      .send({ eventId, customerName: 'Cd', phone: '0922000000', quantity: 1 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SOLD_OUT');
  });

  it('rejects quantities exceeding remaining capacity', async () => {
    const { app, eventId } = await createTestContext({ capacity: 3 });
    await request(app)
      .post('/api/bookings')
      .send({ eventId, customerName: 'Ab', phone: VALID_PHONE, quantity: 2 });
    const res = await request(app)
      .post('/api/bookings')
      .send({ eventId, customerName: 'Cd', phone: '0922000000', quantity: 2 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INSUFFICIENT_CAPACITY');
    assert.equal(res.body.error.details.remaining, 1);
  });

  it('never oversells under concurrent load (exactly capacity wins)', async () => {
    const { app, eventId, db } = await createTestContext({ capacity: 10 });
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app).post('/api/bookings').send({
          eventId,
          customerName: `Guest ${i}`,
          phone: VALID_PHONE,
          quantity: 1,
        }),
      ),
    );
    const succeeded = attempts.filter((r) => r.status === 201);
    const rejected = attempts.filter((r) => r.status === 409);
    assert.equal(succeeded.length, 10);
    assert.equal(rejected.length, 10);
    const row = db.prepare('SELECT reserved_seats FROM events WHERE id = ?').get(eventId) as {
      reserved_seats: number;
    };
    assert.equal(row.reserved_seats, 10);
    const count = db.prepare('SELECT COUNT(*) AS n FROM tickets').get() as { n: number };
    assert.equal(count.n, 10);
  });

  it('rejects invalid quantities', async () => {
    const { app, eventId } = await createTestContext();
    for (const quantity of [0, -1, 1.5, 'two', null, undefined]) {
      const res = await request(app)
        .post('/api/bookings')
        .send({ eventId, customerName: 'Ab', phone: VALID_PHONE, quantity });
      assert.equal(res.status, 400, `quantity ${String(quantity)} should fail`);
      assert.equal(res.body.error.code, 'INVALID_QUANTITY');
    }
  });

  it('rejects invalid phone numbers, accepts valid formats', async () => {
    const { app, eventId } = await createTestContext();
    for (const phone of ['123', 'abc', '0911', '+12025550123', '']) {
      const res = await request(app)
        .post('/api/bookings')
        .send({ eventId, customerName: 'Ab', phone, quantity: 1 });
      assert.equal(res.status, 400, `phone ${phone} should fail`);
      assert.equal(res.body.error.code, 'INVALID_PHONE');
    }
    for (const phone of ['0911123456', '0711123456', '+251911123456', '0911 12 34 56']) {
      const res = await request(app)
        .post('/api/bookings')
        .send({ eventId, customerName: 'Ab', phone, quantity: 1 });
      assert.equal(res.status, 201, `phone ${phone} should pass`);
    }
  });

  it('generates unique booking references and QR tokens', async () => {
    const { app, eventId, db } = await createTestContext({ capacity: 100 });
    const refs = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .post('/api/bookings')
        .send({ eventId, customerName: `Guest ${i}`, phone: VALID_PHONE, quantity: 1 });
      assert.equal(res.status, 201);
      refs.add((res.body.booking as BookingJson).bookingReference);
    }
    assert.equal(refs.size, 30);
    const tokens = (
      db.prepare('SELECT qr_token FROM tickets').all() as Array<{ qr_token: string }>
    ).map((r) => r.qr_token);
    assert.equal(new Set(tokens).size, tokens.length);
    assert.equal(tokens.length, 30);
  });

  it('replays duplicate requests with the same idempotency key (no double booking)', async () => {
    const { app, db, eventId } = await createTestContext({ capacity: 100 });
    const payload = { eventId, customerName: 'Ab', phone: VALID_PHONE, quantity: 2 };
    const key = 'idem-key-12345678';
    const first = await request(app).post('/api/bookings').set('Idempotency-Key', key).send(payload);
    const second = await request(app).post('/api/bookings').set('Idempotency-Key', key).send(payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(
      (second.body.booking as BookingJson).bookingReference,
      (first.body.booking as BookingJson).bookingReference,
    );
    const row = db.prepare('SELECT reserved_seats FROM events WHERE id = ?').get(eventId) as {
      reserved_seats: number;
    };
    assert.equal(row.reserved_seats, 2);
  });

  it('refuses bookings for unpublished events', async () => {
    const { app, eventId } = await createTestContext({ status: 'DRAFT' });
    const res = await request(app)
      .post('/api/bookings')
      .send({ eventId, customerName: 'Ab', phone: VALID_PHONE, quantity: 1 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EVENT_NOT_AVAILABLE');
  });

  it('returns 404 for unknown events', async () => {
    const { app } = await createTestContext();
    const res = await request(app)
      .post('/api/bookings')
      .send({ eventId: 'nope', customerName: 'Ab', phone: VALID_PHONE, quantity: 1 });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'EVENT_NOT_FOUND');
  });
});

describe('GET /api/bookings/:reference', () => {
  it('returns the booking with tickets when the phone matches', async () => {
    const { app, eventId } = await createTestContext();
    const created = await request(app).post('/api/bookings').send({
      eventId,
      customerName: 'Hanna Girma',
      phone: '0911123456',
      quantity: 2,
    });
    const ref = (created.body.booking as BookingJson).bookingReference;
    const res = await request(app).get(`/api/bookings/${ref}?phone=0911123456`);
    assert.equal(res.status, 200);
    assert.equal((res.body.booking as BookingJson).bookingReference, ref);
    assert.equal((res.body.booking as BookingJson).tickets.length, 2);
  });

  it('hides bookings on wrong or missing phone', async () => {
    const { app, eventId } = await createTestContext();
    const created = await request(app).post('/api/bookings').send({
      eventId,
      customerName: 'Ab',
      phone: VALID_PHONE,
      quantity: 1,
    });
    const ref = (created.body.booking as BookingJson).bookingReference;
    const wrong = await request(app).get(`/api/bookings/${ref}?phone=0922000000`);
    assert.equal(wrong.status, 404);
    const missing = await request(app).get(`/api/bookings/${ref}`);
    assert.equal(missing.status, 400);
  });
});
