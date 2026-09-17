/**
 * Booking use-cases. The price/total are ALWAYS computed server-side —
 * anything the client sends about money is ignored.
 *
 * Oversell protection has two independent layers:
 *  1. An atomic conditional UPDATE (reserve only if seats remain) inside an
 *     IMMEDIATE transaction — concurrent requests serialize on the write lock
 *     and exactly one winner emerges per remaining seat.
 *  2. A CHECK constraint (reserved_seats <= capacity) so the database itself
 *     can never represent an oversold event, whatever the code does.
 *
 * Phase 3: bookings carry a payment deadline (expires_at). Stale PENDING
 * bookings are swept (seats released) before capacity-sensitive work, and new
 * tickets start PENDING — they flip ACTIVE only after verified payment.
 */
import type { Db } from '../db/connection';
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

function getEventOrThrow(db: Db, eventId: string): EventRow {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as
    | EventRow
    | undefined;
  if (!event) throw notFound('EVENT_NOT_FOUND', 'Event not found.');
  return event;
}

function readStoredResponse(db: Db, key: string): StoredResponse | null {
  const row = db
    .prepare('SELECT status_code, response_body FROM idempotency_keys WHERE key = ?')
    .get(key) as { status_code: number; response_body: string } | undefined;
  if (!row || row.status_code === 0) return null;
  return { statusCode: row.status_code, body: JSON.parse(row.response_body) as BookingDto };
}

/**
 * Creates a PENDING/UNPAID booking and its (PENDING) tickets. Safe under
 * concurrency and safe to retry with the same idempotency key.
 */
export function createBooking(db: Db, input: CreateBookingInput): StoredResponse {
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
    const stored = readStoredResponse(db, key);
    if (stored) return stored;
    try {
      db.prepare(
        'INSERT INTO idempotency_keys (key, status_code, response_body, created_at) VALUES (?, 0, ?, ?)',
      ).run(key, '{}', nowIso());
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = readStoredResponse(db, key);
        if (existing) return existing;
        throw conflict('CONFLICT', 'This booking request is already being processed. Please wait and try again.');
      }
      throw err;
    }
  }

  const releaseClaim = () => {
    if (key) db.prepare('DELETE FROM idempotency_keys WHERE key = ?').run(key);
  };

  // ---- Free seats from bookings whose payment window lapsed ----
  expireStaleBookings(db);

  // ---- Atomic reservation + booking creation ----
  const run = db.transaction(() => {
    const event = getEventOrThrow(db, eventId);
    if (event.status !== 'PUBLISHED') {
      throw conflict('EVENT_NOT_AVAILABLE', 'This event is not available for booking.');
    }
    if (quantity > event.capacity) {
      throw badRequest('INVALID_QUANTITY', `You can book at most ${event.capacity} tickets for this event.`);
    }

    const at = nowIso();
    const expiresAt = new Date(Date.now() + config.paymentWindowMinutes * 60_000).toISOString();
    const reserve = db.prepare(
      `UPDATE events SET reserved_seats = reserved_seats + ?, updated_at = ?
       WHERE id = ? AND reserved_seats + ? <= capacity`,
    );
    const result = reserve.run(quantity, at, eventId, quantity);
    if (result.changes === 0) {
      const fresh = getEventOrThrow(db, eventId);
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
      try {
        db.prepare(
          `INSERT INTO bookings
             (id, booking_reference, event_id, customer_name, customer_phone, quantity, total_amount, status, payment_status, payment_method, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'UNPAID', NULL, ?, ?, ?)`,
        ).run(
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
        );
        break;
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 4) throw err;
      }
    }

    const tickets: TicketRow[] = [];
    const insertTicket = db.prepare(
      `INSERT INTO tickets (id, booking_id, ticket_number, qr_token, status, validated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING', NULL, ?, ?)`,
    );
    for (let i = 0; i < quantity; i++) {
      for (let attempt = 0; ; attempt++) {
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
          insertTicket.run(row.id, row.booking_id, row.ticket_number, row.qr_token, at, at);
          tickets.push(row);
          break;
        } catch (err) {
          if (!isUniqueViolation(err) || attempt === 4) throw err;
        }
      }
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as BookingRow;
    return toBookingDto(booking, tickets, getEventOrThrow(db, eventId));
  });

  let body: BookingDto;
  try {
    body = (run as unknown as { immediate: () => BookingDto }).immediate();
  } catch (err) {
    releaseClaim();
    throw err;
  }

  if (key) {
    db.prepare('UPDATE idempotency_keys SET status_code = 201, response_body = ? WHERE key = ?').run(
      JSON.stringify(body),
      key,
    );
  }
  return { statusCode: 201, body };
}

/**
 * Public booking lookup. The phone number is REQUIRED and must match, so a
 * booking reference alone cannot be used to harvest other guests' tickets.
 */
export function getBookingByReference(db: Db, reference: string, phoneRaw?: string): BookingDto {
  const ref = reference?.trim().toUpperCase() ?? '';
  if (!ref) throw badRequest('VALIDATION_ERROR', 'Booking reference is required.');
  if (!phoneRaw?.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Phone number is required to view a booking.');
  }
  const booking = db
    .prepare('SELECT * FROM bookings WHERE booking_reference = ?')
    .get(ref) as BookingRow | undefined;
  if (!booking || booking.customer_phone !== normalizePhone(phoneRaw)) {
    // Identical response whether the reference or the phone is wrong.
    throw notFound('BOOKING_NOT_FOUND', 'Booking not found.');
  }
  const tickets = db
    .prepare('SELECT * FROM tickets WHERE booking_id = ? ORDER BY created_at ASC')
    .all(booking.id) as TicketRow[];
  const event = getEventOrThrow(db, booking.event_id);
  return toBookingDto(booking, tickets, event);
}

export { qrPayloadFor };
