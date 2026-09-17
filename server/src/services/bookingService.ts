/**
 * Booking use-cases. The price/total are ALWAYS computed server-side —
 * anything the client sends about money is ignored.
 *
 * Oversell protection has three independent layers:
 *  1. The reservation transaction locks the event row (`SELECT … FOR UPDATE`),
 *     so concurrent bookings for one event serialize and see fresh state.
 *  2. An atomic conditional UPDATE (reserve only if seats remain) — the loser
 *     of a race sees zero changed rows and gets a precise SOLD_OUT /
 *     INSUFFICIENT_CAPACITY answer computed from a fresh read.
 *  3. A CHECK constraint (reserved_seats <= capacity) so the database itself
 *     can never represent an oversold event, whatever the code does.
 *
 * Phase 3: bookings carry a payment deadline (expires_at). Stale PENDING
 * bookings are swept (seats released) before capacity-sensitive work, and new
 * tickets start PENDING — they flip ACTIVE only after verified payment.
 *
 * Postgres note: ANY error aborts the enclosing transaction, so the
 * reference/token retry loops isolate each attempt in a SAVEPOINT and roll
 * back to it on a unique collision.
 */
import type { Db, RootDb, Tx } from '../db/connection';
import type { BookingRow, EventRow, TicketRow } from '../db/types';
import { config } from '../config';
import { badRequest, conflict, isUniqueViolation, notFound } from '../lib/errors';
import {
  newBookingReference,
  newId,
  newQrToken,
  newTicketNumber,
  qrPayloadFor,
} from '../lib/ids';
import { isValidCustomerName, isValidEthiopianPhone, normalizePhone } from '../../../shared/validation';
import { expireStaleBookings } from './expiry';
import type { BookingDto } from './dto';
import { toBookingDto } from './dto';

export interface CreateBookingInput {
  eventId: string;
  customerName: string;
  phone: string;
  quantity: number;
  idempotencyKey?: string;
}

export interface StoredResponse {
  statusCode: number;
  body: BookingDto;
}

const MAX_IDEMPOTENCY_KEY_LEN = 128;

function nowIso(): string {
  return new Date().toISOString();
}

async function getEventOrThrow(db: Db, eventId: string): Promise<EventRow> {
  const event = await db.get<EventRow>('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!event) throw notFound('EVENT_NOT_FOUND', 'Event not found.');
  return event;
}

/**
 * Locked event read for the reservation transaction: concurrent bookings for
 * the same event wait here, then proceed one after another on fresh state.
 */
async function getEventForUpdate(tx: Tx, eventId: string): Promise<EventRow> {
  const event = await tx.get<EventRow>('SELECT * FROM events WHERE id = $1 FOR UPDATE', [
    eventId,
  ]);
  if (!event) throw notFound('EVENT_NOT_FOUND', 'Event not found.');
  return event;
}

async function readStoredResponse(db: Db, key: string): Promise<StoredResponse | null> {
  const row = await db.get<{ status_code: number; response_body: string }>(
    'SELECT status_code, response_body FROM idempotency_keys WHERE key = $1',
    [key],
  );
  if (!row || row.status_code === 0) return null;
  return { statusCode: row.status_code, body: JSON.parse(row.response_body) as BookingDto };
}

/**
 * Creates a PENDING/UNPAID booking and its (PENDING) tickets. Safe under
 * concurrency and safe to retry with the same idempotency key.
 */
export async function createBooking(
  db: RootDb,
  input: CreateBookingInput,
): Promise<StoredResponse> {
  const eventId = input.eventId?.trim() ?? '';
  const customerName = input.customerName?.trim() ?? '';
  const phone = input.phone?.trim() ?? '';
  const { quantity } = input;

  // ---- Pure validation (no DB writes yet) ----
  if (!eventId) throw badRequest('VALIDATION_ERROR', 'Event is required.');
  if (!isValidCustomerName(customerName)) {
    throw badRequest('VALIDATION_ERROR', 'Please enter the name for this booking.');
  }
  if (!isValidEthiopianPhone(phone)) {
    throw badRequest('INVALID_PHONE', 'Enter a valid Ethiopian mobile number (e.g. 0911 12 34 56).');
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw badRequest('INVALID_QUANTITY', 'Quantity must be at least 1.');
  }

  const key = input.idempotencyKey?.trim() || undefined;
  if (key && key.length > MAX_IDEMPOTENCY_KEY_LEN) {
    throw badRequest('VALIDATION_ERROR', 'Idempotency key is too long.');
  }

  // ---- Idempotency pre-claim (prevents double-booking on retries) ----
  if (key) {
    const stored = await readStoredResponse(db, key);
    if (stored) return stored;
    try {
      await db.run(
        'INSERT INTO idempotency_keys (key, status_code, response_body, created_at) VALUES ($1, 0, $2, $3)',
        [key, '{}', nowIso()],
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await readStoredResponse(db, key);
        if (existing) return existing;
        throw conflict('CONFLICT', 'This booking request is already being processed. Please wait and try again.');
      }
      throw err;
    }
  }

  const releaseClaim = async () => {
    if (key) await db.run('DELETE FROM idempotency_keys WHERE key = $1', [key]);
  };

  // ---- Free seats from bookings whose payment window lapsed ----
  await expireStaleBookings(db);

  // ---- Atomic reservation + booking creation ----
  let body: BookingDto;
  try {
    body = await db.transaction(async (tx) => {
      const event = await getEventForUpdate(tx, eventId);
      if (event.status !== 'PUBLISHED') {
        throw conflict('EVENT_NOT_AVAILABLE', 'This event is not available for booking.');
      }
      if (quantity > event.capacity) {
        throw badRequest('INVALID_QUANTITY', `You can book at most ${event.capacity} tickets for this event.`);
      }

      const at = nowIso();
      const expiresAt = new Date(Date.now() + config.paymentWindowMinutes * 60_000).toISOString();
      const reserve = await tx.run(
        `UPDATE events SET reserved_seats = reserved_seats + $1, updated_at = $2
         WHERE id = $3 AND reserved_seats + $1 <= capacity`,
        [quantity, at, eventId],
      );
      if (reserve.changes === 0) {
        const fresh = await getEventOrThrow(tx, eventId);
        const remaining = Math.max(0, fresh.capacity - fresh.reserved_seats);
        if (remaining <= 0) {
          throw conflict('SOLD_OUT', 'This event is sold out.', { remaining: 0 });
        }
        throw conflict('INSUFFICIENT_CAPACITY', `Only ${remaining} seats are still available.`, {
          remaining,
          requested: quantity,
        });
      }

      // Server-calculated total — never trust the client.
      const totalAmount = event.ticket_price * quantity;

      const bookingId = newId();
      let bookingReference = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        bookingReference = newBookingReference();
        const sp = `bref_${attempt}`;
        await tx.savepoint(sp);
        try {
          await tx.run(
            `INSERT INTO bookings
               (id, booking_reference, event_id, customer_name, customer_phone, quantity, total_amount, status, payment_status, payment_method, expires_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', 'UNPAID', NULL, $8, $9, $10)`,
            [
              bookingId,
              bookingReference,
              eventId,
              customerName,
              normalizePhone(phone),
              quantity,
              totalAmount,
              expiresAt,
              at,
              at,
            ],
          );
          await tx.releaseSavepoint(sp);
          break;
        } catch (err) {
          await tx.rollbackToSavepoint(sp);
          if (!isUniqueViolation(err) || attempt === 4) throw err;
        }
      }

      const tickets: TicketRow[] = [];
      for (let i = 0; i < quantity; i++) {
        for (let attempt = 0; ; attempt++) {
          const sp = `tkt_${i}_${attempt}`;
          await tx.savepoint(sp);
          try {
            const row: TicketRow = {
              id: newId(),
              booking_id: bookingId,
              ticket_number: newTicketNumber(),
              qr_token: newQrToken(),
              status: 'PENDING',
              validated_at: null,
              created_at: at,
              updated_at: at,
            };
            await tx.run(
              `INSERT INTO tickets (id, booking_id, ticket_number, qr_token, status, validated_at, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'PENDING', NULL, $5, $6)`,
              [row.id, row.booking_id, row.ticket_number, row.qr_token, at, at],
            );
            await tx.releaseSavepoint(sp);
            tickets.push(row);
            break;
          } catch (err) {
            await tx.rollbackToSavepoint(sp);
            if (!isUniqueViolation(err) || attempt === 4) throw err;
          }
        }
      }

      const booking = (await tx.get<BookingRow>('SELECT * FROM bookings WHERE id = $1', [
        bookingId,
      ])) as BookingRow;
      return toBookingDto(booking, tickets, await getEventOrThrow(tx, eventId));
    });
  } catch (err) {
    await releaseClaim();
    throw err;
  }

  if (key) {
    await db.run('UPDATE idempotency_keys SET status_code = 201, response_body = $1 WHERE key = $2', [
      JSON.stringify(body),
      key,
    ]);
  }
  return { statusCode: 201, body };
}

/**
 * Public booking lookup. The phone number is REQUIRED and must match, so a
 * booking reference alone cannot be used to harvest other guests' tickets.
 */
export async function getBookingByReference(
  db: Db,
  reference: string,
  phoneRaw?: string,
): Promise<BookingDto> {
  const ref = reference?.trim().toUpperCase() ?? '';
  if (!ref) throw badRequest('VALIDATION_ERROR', 'Booking reference is required.');
  if (!phoneRaw?.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Phone number is required to view a booking.');
  }
  const booking = await db.get<BookingRow>(
    'SELECT * FROM bookings WHERE booking_reference = $1',
    [ref],
  );
  if (!booking || booking.customer_phone !== normalizePhone(phoneRaw)) {
    // Identical response whether the reference or the phone is wrong.
    throw notFound('BOOKING_NOT_FOUND', 'Booking not found.');
  }
  const tickets = await db.all<TicketRow>(
    'SELECT * FROM tickets WHERE booking_id = $1 ORDER BY created_at ASC',
    [booking.id],
  );
  const event = await getEventOrThrow(db, booking.event_id);
  return toBookingDto(booking, tickets, event);
}

export { qrPayloadFor };
