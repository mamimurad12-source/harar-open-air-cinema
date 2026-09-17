/**
 * Gate-side ticket validation. Every outcome is explicit; a USED ticket can
 * never validate again (the status flip is a conditional UPDATE, so even two
 * simultaneous scans admit only one guest).
 *
 * Phase 3 rule: tickets are PENDING until payment is verified. A PENDING
 * ticket is INVALID at the gate (explicit "payment not verified" message) —
 * only ACTIVE tickets from CONFIRMED bookings validate.
 */
import type { Db } from '../db/connection';
import type { BookingRow, EventRow, TicketRow } from '../db/types';
import { badRequest } from '../lib/errors';
import { extractQrToken } from '../lib/ids';

export type ValidationOutcome = 'VALID' | 'ALREADY_USED' | 'INVALID' | 'CANCELLED';

export interface ValidationResult {
  outcome: ValidationOutcome;
  message: string;
  ticketNumber: string | null;
  customerName: string | null;
  quantity: number | null;
  bookingReference: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  /** True when the ticket is genuine but money hasn't been verified. */
  paymentPending: boolean;
  validatedAt: string | null;
  eventTitle: string | null;
}

interface JoinedRow extends TicketRow {
  booking_reference: string;
  customer_name: string;
  quantity: number;
  booking_status: string;
  payment_status: string;
  event_title: string;
  event_status: string;
}

function base(outcome: ValidationOutcome, message: string): ValidationResult {
  return {
    outcome,
    message,
    ticketNumber: null,
    customerName: null,
    quantity: null,
    bookingReference: null,
    bookingStatus: null,
    paymentStatus: null,
    paymentPending: false,
    validatedAt: null,
    eventTitle: null,
  };
}

export function validateTicket(db: Db, rawInput: string): ValidationResult {
  const token = extractQrToken(rawInput ?? '');
  if (!token) throw badRequest('VALIDATION_ERROR', 'Ticket code is required.');

  const row = db
    .prepare(
      `SELECT t.*,
              b.booking_reference, b.customer_name, b.quantity,
              b.status AS booking_status, b.payment_status,
              e.title AS event_title, e.status AS event_status
       FROM tickets t
       JOIN bookings b ON b.id = t.booking_id
       JOIN events e ON e.id = b.event_id
       WHERE t.qr_token = ? OR t.ticket_number = ?`,
    )
    .get(token, token.toUpperCase()) as JoinedRow | undefined;

  if (!row) {
    return base('INVALID', 'Ticket not found. Do not admit.');
  }
  if (row.event_status !== 'PUBLISHED') {
    return {
      ...base('INVALID', 'This event is no longer active. Do not admit.'),
      ticketNumber: row.ticket_number,
      eventTitle: row.event_title,
    };
  }
  if (row.booking_status === 'CANCELLED' || row.booking_status === 'EXPIRED' || row.status === 'CANCELLED') {
    return {
      ...base('CANCELLED', 'This ticket was cancelled. Do not admit.'),
      ticketNumber: row.ticket_number,
      customerName: row.customer_name,
      bookingReference: row.booking_reference,
      bookingStatus: row.booking_status,
      eventTitle: row.event_title,
    };
  }
  if (row.status === 'PENDING' || row.booking_status !== 'CONFIRMED') {
    return {
      ...base('INVALID', 'Ticket not active yet — payment has not been verified. Do not admit.'),
      ticketNumber: row.ticket_number,
      customerName: row.customer_name,
      quantity: row.quantity,
      bookingReference: row.booking_reference,
      bookingStatus: row.booking_status,
      paymentStatus: row.payment_status,
      paymentPending: true,
      eventTitle: row.event_title,
    };
  }
  if (row.status === 'USED') {
    return {
      ...base('ALREADY_USED', 'This ticket was already used. Do not admit again.'),
      ticketNumber: row.ticket_number,
      customerName: row.customer_name,
      quantity: row.quantity,
      bookingReference: row.booking_reference,
      bookingStatus: row.booking_status,
      paymentStatus: row.payment_status,
      validatedAt: row.validated_at,
      eventTitle: row.event_title,
    };
  }

  // ACTIVE → USED, guarded so exactly one concurrent scan wins.
  const at = new Date().toISOString();
  const flip = db
    .prepare(`UPDATE tickets SET status = 'USED', validated_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'`)
    .run(at, at, row.id);
  if (flip.changes === 0) {
    return {
      ...base('ALREADY_USED', 'This ticket was just used. Do not admit again.'),
      ticketNumber: row.ticket_number,
      eventTitle: row.event_title,
    };
  }

  return {
    outcome: 'VALID',
    message: 'Valid ticket — admit guest.',
    ticketNumber: row.ticket_number,
    customerName: row.customer_name,
    quantity: row.quantity,
    bookingReference: row.booking_reference,
    bookingStatus: row.booking_status,
    paymentStatus: row.payment_status,
    paymentPending: false,
    validatedAt: at,
    eventTitle: row.event_title,
  };
}

export type { BookingRow, EventRow, TicketRow };
