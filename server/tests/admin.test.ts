import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { VALID_PHONE, authCookie, createTestContext } from './helper';

async function loginCookie(
  app: Parameters<typeof request>[0],
  email = 'admin@test.local',
  password = 'test-password-123',
): Promise<string> {
  const res = await request(app).post('/api/admin/login').send({ email, password });
  assert.equal(res.status, 200);
  const setCookie = res.headers['set-cookie'] as string | string[];
  return ((Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0] as string) ?? '';
}

describe('admin authentication', () => {
  it('logs in with correct credentials and returns a safe user object', async () => {
    const { app } = await createTestContext();
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.local', password: 'test-password-123' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'admin@test.local');
    assert.ok(!('password_hash' in res.body.user));
    assert.ok(!('passwordHash' in res.body.user));
    assert.match(String(res.headers['set-cookie'] ?? ''), /hoc_admin_session=/);
  });

  it('rejects wrong credentials without distinguishing the cause', async () => {
    const { app } = await createTestContext();
    const wrongPass = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.local', password: 'nope' });
    assert.equal(wrongPass.status, 401);
    assert.equal(wrongPass.body.error.code, 'INVALID_CREDENTIALS');
    const unknown = await request(app)
      .post('/api/admin/login')
      .send({ email: 'nobody@test.local', password: 'test-password-123' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('protects every admin route (401 without a session)', async () => {
    const { app, eventId } = await createTestContext();
    const probes = [
      request(app).get('/api/admin/me'),
      request(app).get('/api/admin/events'),
      request(app).post('/api/admin/events').send({}),
      request(app).patch(`/api/admin/events/${eventId}`).send({}),
      request(app).get('/api/admin/bookings'),
      request(app).get('/api/admin/bookings/HOC-XXXXXX'),
      request(app).post('/api/admin/tickets/validate').send({ token: 'x' }),
    ];
    for (const probe of probes) {
      const res = await probe;
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    }
  });

  it('exposes the session via /me and destroys it on logout', async () => {
    const { app } = await createTestContext();
    const cookie = await loginCookie(app);
    const me = await request(app).get('/api/admin/me').set(authCookie(cookie));
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'admin@test.local');
    const logout = await request(app).post('/api/admin/logout').set(authCookie(cookie));
    assert.equal(logout.status, 200);
    const cleared = String(logout.headers['set-cookie'] ?? '');
    assert.match(cleared, /hoc_admin_session=/);
    const after = await request(app).get('/api/admin/me');
    assert.equal(after.status, 401);
  });
});

describe('admin event management', () => {
  it('creates draft events, publishes them, and the public catalog follows', async () => {
    const { app } = await createTestContext();
    const cookie = await loginCookie(app);
    const created = await request(app)
      .post('/api/admin/events')
      .set(authCookie(cookie))
      .send({
        title: 'Second Night',
        date: '16-1-2019 EC',
        startTime: '11:00 LT',
        venueName: 'Arthur Rimbaud Museum',
        venueLocation: 'Harar, Ethiopia',
        ticketPrice: 300,
        capacity: 50,
        freeSnack: true,
      });
    assert.equal(created.status, 201);
    const id = created.body.event.id as string;
    assert.equal(created.body.event.status, 'DRAFT');

    const beforePublish = await request(app).get('/api/events');
    assert.ok(!(beforePublish.body.events as Array<{ id: string }>).some((e) => e.id === id));

    const published = await request(app)
      .patch(`/api/admin/events/${id}`)
      .set(authCookie(cookie))
      .send({ status: 'PUBLISHED' });
    assert.equal(published.status, 200);
    assert.equal(published.body.event.status, 'PUBLISHED');

    const afterPublish = await request(app).get('/api/events');
    assert.ok((afterPublish.body.events as Array<{ id: string }>).some((e) => e.id === id));
  });

  it('edits movie info, price, capacity and snack flag', async () => {
    const { app, eventId } = await createTestContext();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .patch(`/api/admin/events/${eventId}`)
      .set(authCookie(cookie))
      .send({
        movieTitle: 'A Great Film',
        movieSynopsis: 'An unforgettable night.',
        ticketPrice: 300,
        capacity: 120,
        freeSnack: false,
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.movieTitle, 'A Great Film');
    assert.equal(res.body.event.ticketPrice, 300);
    assert.equal(res.body.event.capacity, 120);
    assert.equal(res.body.event.freeSnack, false);
  });

  it('refuses capacity below already-reserved seats', async () => {
    const { app, eventId } = await createTestContext({ capacity: 100 });
    await request(app).post('/api/bookings').send({
      eventId,
      customerName: 'Ab',
      phone: VALID_PHONE,
      quantity: 4,
    });
    const cookie = await loginCookie(app);
    const res = await request(app)
      .patch(`/api/admin/events/${eventId}`)
      .set(authCookie(cookie))
      .send({ capacity: 3 });
    assert.equal(res.status, 400);
  });

  it('rejects invalid event payloads', async () => {
    const { app } = await createTestContext();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .post('/api/admin/events')
      .set(authCookie(cookie))
      .send({ title: '', ticketPrice: -5, capacity: 0 });
    assert.equal(res.status, 400);
  });
});

describe('admin bookings', () => {
  it('lists bookings and shows detail with tickets', async () => {
    const { app, eventId } = await createTestContext();
    const created = await request(app).post('/api/bookings').send({
      eventId,
      customerName: 'Hanna Girma',
      phone: '0911123456',
      quantity: 2,
    });
    const ref = created.body.booking.bookingReference as string;
    const cookie = await loginCookie(app);

    const list = await request(app).get('/api/admin/bookings').set(authCookie(cookie));
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    const item = list.body.bookings[0] as Record<string, unknown>;
    assert.equal(item.bookingReference, ref);
    assert.equal(item.customerName, 'Hanna Girma');
    assert.equal(item.quantity, 2);
    assert.equal(item.totalAmount, 500);
    assert.equal(item.status, 'PENDING');
    assert.equal(item.paymentStatus, 'UNPAID');

    const detail = await request(app).get(`/api/admin/bookings/${ref}`).set(authCookie(cookie));
    assert.equal(detail.status, 200);
    assert.equal((detail.body.booking.tickets as unknown[]).length, 2);
    assert.equal(detail.body.booking.event.id, eventId);
  });
});
