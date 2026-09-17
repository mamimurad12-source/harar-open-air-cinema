/**
 * PaymentService — the booking system's ONLY interface to money.
 *
 * Lifecycle: booking PENDING + payment UNPAID → initiate (payment PENDING) →
 * provider confirms → backend independently verifies (webhook + re-query, or
 * explicit verify pull) → payment PAID → booking CONFIRMED → tickets ACTIVE.
 *
 * Rules enforced here, unconditionally:
 * - Amounts come from the DB (price × qty). The client can send nothing.
 * - Frontend redirects/callbacks NEVER complete a payment — only provider
 *   evidence (server-to-server verify, or signed webhook + re-query) does.
 * - Completion is a single transaction and naturally idempotent.
 * - Webhook events are recorded, so duplicates replay without side effects.
 */
import type { Db } from '../../db/connection';
import type { BookingRow, EventRow, PaymentMethod, PaymentRow } from '../../db/types';
import { config } from '../../config';
import { ApiError, badRequest, conflict, notFound } from '../../lib/errors';
import { newId, randomCode } from '../../lib/ids';
import { normalizePhone } from '../../../../shared/validation';
import { expireOneBooking, expireStaleBookings, isBookingExpired } from '../expiry';
import type { BookingDto, PaymentDto, PaymentLedgerItem } from '../dto';
import { toBookingDto, toPaymentDto } from '../dto';
import { getProvider, providerForMethod } from './registry';
import { isPaymentMethod } from './types';
import type { PaymentProvider, VerificationEvidence } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function txRefFor(bookingReference: string): string {
  return `hoc-${bookingReference}-${randomCode(4)}`;
}

function getBookingByRef(db: Db, reference: string): BookingRow {
  const booking = db
    .prepare('SELECT * FROM bookings WHERE booking_reference = ?')
    .get(reference.trim().toUpperCase()) as BookingRow | undefined;
  if (!booking) throw notFound('BOOKING_NOT_FOUND', 'Booking not found.');
  return booking;
}

function getEventOrThrow(db: Db, eventId: string): EventRow {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as
    | EventRow
    | undefined;
  if (!event) throw notFound('EVENT_NOT_FOUND', 'Event not found.');
  return event;
}

function getPaymentByBooking(db: Db, bookingId: string): PaymentRow | null {
  return (db.prepare('SELECT * FROM payments WHERE booking_id = ?').get(bookingId) as PaymentRow | undefined) ?? null;
}

function failPayment(db: Db, paymentId: string, reason: string): void {
  db.prepare(
    `UPDATE payments SET status = 'FAILED', failure_reason = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'`,
  ).run(reason, nowIso(), paymentId);
}

export interface InitiatePaymentResult {
  payment: PaymentDto;
  /** Null for push-style rails (none currently — Chapa always redirects). */
  checkoutUrl: string | null;
  expiresAt: string | null;
}

/**
 * Start (or resume after failure) a payment attempt for a PENDING booking.
 * Creates the authoritative PENDING payment row, then calls the provider.
 */
export async function initiatePayment(
  db: Db,
  input: { bookingReference: string; paymentMethod: unknown },
): Promise<InitiatePaymentResult> {
  const ref = input.bookingReference?.trim().toUpperCase() ?? '';
  if (!ref) throw badRequest('VALIDATION_ERROR', 'Booking reference is required.');
  if (!isPaymentMethod(input.paymentMethod)) {
    throw badRequest('VALIDATION_ERROR', 'Select a valid payment method.');
  }
  const method: PaymentMethod = input.paymentMethod;

  expireStaleBookings(db);

  const provider = providerForMethod(method);
  if (!provider) {
    throw conflict('PAYMENT_NOT_PAYABLE', 'This payment method is coming soon.');
  }

  const setup = db.transaction(() => {
    const booking = getBookingByRef(db, ref);
    const existing = getPaymentByBooking(db, booking.id);
    if (existing?.status === 'PAID') {
      throw conflict('ALREADY_PAID', 'This booking is already paid.');
    }
    if (booking.status === 'EXPIRED') {
      throw new ApiError(410, 'BOOKING_EXPIRED', 'This booking has expired. Please book again.');
    }
    if (booking.status !== 'PENDING') {
      throw conflict(
        'PAYMENT_NOT_PAYABLE',
        `This booking is ${booking.status.toLowerCase()} and can no longer be paid.`,
      );
    }
    const now = nowIso();
    if (isBookingExpired(booking, now)) {
      // Belt-and-braces: the pre-sweep normally expires these first.
      expireOneBooking(db, booking, now);
      throw new ApiError(410, 'BOOKING_EXPIRED', 'This booking has expired. Please book again.');
    }
    const event = getEventOrThrow(db, booking.event_id);
    const amount = event.ticket_price * booking.quantity;

    // Fresh provider reference per attempt (Chapa rejects reused tx_refs).
    let txRef = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      txRef = txRefFor(ref);
      const clash = db
        .prepare('SELECT id FROM payments WHERE provider_transaction_id = ?')
        .get(txRef);
      if (!clash) break;
      if (attempt === 4) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not start payment.');
    }

    if (!existing) {
      db.prepare(
        `INSERT INTO payments (id, booking_id, payment_method, provider, provider_transaction_id,
          provider_reference, provider_method, amount, currency, status, failure_reason,
          init_payload, verify_payload, created_at, updated_at, verified_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 'ETB', 'PENDING', NULL, NULL, NULL, ?, ?, NULL)`,
      ).run(newId(), booking.id, method, provider.id, txRef, amount, now, now);
    } else {
      db.prepare(
        `UPDATE payments SET payment_method = ?, provider = ?, provider_transaction_id = ?,
          provider_reference = NULL, provider_method = NULL, amount = ?, currency = 'ETB',
          status = 'PENDING', failure_reason = NULL, init_payload = NULL, verify_payload = NULL,
          updated_at = ?, verified_at = NULL WHERE id = ?`,
      ).run(method, provider.id, txRef, amount, now, existing.id);
    }
    db.prepare('UPDATE bookings SET payment_method = ?, updated_at = ? WHERE id = ?').run(
      method,
      now,
      booking.id,
    );

    const payment = getPaymentByBooking(db, booking.id) as PaymentRow;
    return { booking, payment, amount, eventTitle: event.title };
  });

  const { booking, payment, amount, eventTitle } = (
    setup as unknown as {
      immediate: () => {
        booking: BookingRow;
        payment: PaymentRow;
        amount: number;
        eventTitle: string;
      };
    }
  ).immediate();

  let init: { checkoutUrl?: string; providerReference?: string; audit: unknown };
  try {
    init = await provider.createPayment({
      transactionId: payment.provider_transaction_id as string,
      amountBirr: amount,
      currency: 'ETB',
      customerName: booking.customer_name,
      customerPhone: booking.customer_phone,
      bookingReference: ref,
      eventTitle,
      callbackUrl: `${config.publicApiUrl}/api/payments/callback/${provider.id}`,
      returnUrl: `${config.publicBaseUrl}/pay/return?provider=${provider.id}&tx=${encodeURIComponent(payment.provider_transaction_id as string)}`,
    });
  } catch {
    failPayment(db, payment.id, 'Payment provider unreachable — please try again.');
    throw new ApiError(
      502,
      'PROVIDER_ERROR',
      'Payment provider is unreachable. Please try again.',
    );
  }

  db.prepare('UPDATE payments SET init_payload = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify({
      checkoutUrl: init.checkoutUrl ?? null,
      providerReference: init.providerReference ?? null,
      audit: init.audit,
      at: nowIso(),
    }),
    nowIso(),
    payment.id,
  );
  const fresh = getPaymentByBooking(db, booking.id) as PaymentRow;
  return {
    payment: toPaymentDto(fresh, ref),
    checkoutUrl: init.checkoutUrl ?? null,
    expiresAt: booking.expires_at,
  };
}

export interface PaymentStatusView {
  booking: BookingDto;
  payment: PaymentDto | null;
}

/** Read-only status view (booking + payment). Phone must match. */
export function getPaymentStatus(db: Db, reference: string, phoneRaw?: string): PaymentStatusView {
  expireStaleBookings(db);
  const ref = reference?.trim().toUpperCase() ?? '';
  if (!ref) throw badRequest('VALIDATION_ERROR', 'Booking reference is required.');
  if (!phoneRaw?.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Phone number is required to view payment status.');
  }
  const booking = getBookingByRef(db, ref);
  if (booking.customer_phone !== normalizePhone(phoneRaw)) {
    throw notFound('BOOKING_NOT_FOUND', 'Booking not found.');
  }
  const tickets = db
    .prepare('SELECT * FROM tickets WHERE booking_id = ? ORDER BY created_at ASC')
    .all(booking.id) as import('../../db/types').TicketRow[];
  const event = getEventOrThrow(db, booking.event_id);
  const payment = getPaymentByBooking(db, booking.id);
  return {
    booking: toBookingDto(booking, tickets, event),
    payment: payment ? toPaymentDto(payment, ref) : null,
  };
}

export type ApplyAction =
  | 'completed'
  | 'already-paid'
  | 'not-payable'
  | 'still-pending'
  | 'failed'
  | 'booking-invalid';

export interface ApplyResult {
  action: ApplyAction;
  detail?: string;
}

/**
 * The single completion engine used by BOTH the verify pull and webhooks.
 * Runs the money-critical section in one transaction; safe to call twice.
 */
export function applyVerification(
  db: Db,
  payment: PaymentRow,
  evidence: VerificationEvidence,
  expectedMode: string | null,
): ApplyResult {
  if (payment.status === 'PAID') return { action: 'already-paid' };
  if (payment.status !== 'PENDING') return { action: 'not-payable', detail: payment.status };
  if (evidence.verdict === 'PENDING' || evidence.verdict === 'UNKNOWN') {
    return { action: 'still-pending' };
  }
  if (evidence.verdict === 'FAILED') {
    failPayment(db, payment.id, evidence.failureReason ?? 'Provider reported failure.');
    return { action: 'failed', detail: evidence.failureReason };
  }

  // verdict PAID → verify every field inside the transaction, then complete.
  const run = db.transaction(() => {
    const current = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id) as PaymentRow;
    if (current.status === 'PAID') return { action: 'already-paid' } as ApplyResult;
    if (current.status !== 'PENDING') {
      return { action: 'not-payable', detail: current.status } as ApplyResult;
    }
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(current.booking_id) as BookingRow;
    const now = nowIso();
    if (booking.status !== 'PENDING' || isBookingExpired(booking, now)) {
      if (booking.status === 'PENDING') expireOneBooking(db, booking, now);
      else {
        db.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ?, updated_at = ? WHERE id = ?`).run(
          `Booking is ${booking.status.toLowerCase()}.`,
          now,
          current.id,
        );
      }
      return { action: 'booking-invalid', detail: booking.status } as ApplyResult;
    }
    if (evidence.currency !== 'ETB') {
      failPayment(db, current.id, `Currency mismatch (expected ETB, got ${evidence.currency || 'none'}).`);
      return { action: 'failed', detail: 'currency mismatch' } as ApplyResult;
    }
    const paidMajor =
      evidence.amountUnit === 'minor' ? evidence.amountMinorOrMajor / 100 : evidence.amountMinorOrMajor;
    if (!Number.isFinite(paidMajor) || paidMajor !== current.amount) {
      failPayment(db, current.id, `Amount mismatch (expected ${current.amount} ETB).`);
      return { action: 'failed', detail: 'amount mismatch' } as ApplyResult;
    }
    if (expectedMode && evidence.mode && evidence.mode !== expectedMode) {
      failPayment(db, current.id, 'Provider mode mismatch.');
      return { action: 'failed', detail: 'mode mismatch' } as ApplyResult;
    }

    db.prepare(
      `UPDATE payments SET status = 'PAID', provider_reference = ?, provider_method = ?,
        verify_payload = ?, updated_at = ?, verified_at = ? WHERE id = ?`,
    ).run(
      evidence.providerReference ?? current.provider_reference,
      evidence.providerMethod ?? current.provider_method,
      JSON.stringify({ audit: evidence.audit, at: now }),
      now,
      now,
      current.id,
    );
    db.prepare(`UPDATE bookings SET status = 'CONFIRMED', payment_status = 'PAID', updated_at = ? WHERE id = ?`).run(
      now,
      booking.id,
    );
    db.prepare(`UPDATE tickets SET status = 'ACTIVE', updated_at = ? WHERE booking_id = ? AND status = 'PENDING'`).run(
      now,
      booking.id,
    );
    return { action: 'completed' } as ApplyResult;
  });
  return (run as unknown as { immediate: () => ApplyResult }).immediate();
}

/**
 * Explicit server-side re-verification ("customer returned from payment" →
 * "let me check with the provider"). Powers the return page + manual retry.
 */
export async function triggerVerifyPayment(
  db: Db,
  reference: string,
  phoneRaw?: string,
): Promise<PaymentStatusView & { verification: ApplyAction }> {
  expireStaleBookings(db);
  const ref = reference?.trim().toUpperCase() ?? '';
  if (!ref) throw badRequest('VALIDATION_ERROR', 'Booking reference is required.');
  if (!phoneRaw?.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Phone number is required to verify payment.');
  }
  const booking = getBookingByRef(db, ref);
  if (booking.customer_phone !== normalizePhone(phoneRaw)) {
    throw notFound('BOOKING_NOT_FOUND', 'Booking not found.');
  }
  const payment = getPaymentByBooking(db, booking.id);
  if (!payment) throw notFound('PAYMENT_NOT_FOUND', 'No payment has been initiated for this booking.');
  if (payment.status === 'PAID') {
    return { ...getPaymentStatus(db, ref, phoneRaw), verification: 'already-paid' };
  }
  if (payment.status !== 'PENDING') {
    return { ...getPaymentStatus(db, ref, phoneRaw), verification: 'not-payable' };
  }
  const provider = getProvider(payment.provider);
  if (!provider || !provider.isConfigured()) {
    throw new ApiError(502, 'PROVIDER_ERROR', 'Payment provider is not available.');
  }
  let evidence: VerificationEvidence;
  try {
    evidence = await provider.verifyPayment(payment.provider_transaction_id as string);
  } catch {
    throw new ApiError(502, 'PROVIDER_ERROR', 'Could not reach the payment provider. Try again.');
  }
  const result = applyVerification(db, payment, evidence, provider.expectedMode?.() ?? null);
  return { ...getPaymentStatus(db, ref, phoneRaw), verification: result.action };
}

export type WebhookOutcome =
  | 'completed'
  | 'already-processed'
  | 'failed-recorded'
  | 'pending'
  | 'ignored';

/**
 * Signed-webhook handler core. Re-queries the provider before crediting (per
 * provider best practice), then runs the shared completion engine. The event
 * is recorded exactly once — duplicates return 'already-processed'.
 */
export async function handleProviderWebhook(
  db: Db,
  provider: PaymentProvider,
  eventId: string,
  transactionId: string,
  payloadJson: string,
): Promise<{ outcome: WebhookOutcome; detail?: string }> {
  const seen = db
    .prepare('SELECT event_id FROM webhook_events WHERE provider = ? AND event_id = ?')
    .get(provider.id, eventId);
  if (seen) return { outcome: 'already-processed' };

  const record = () => {
    db.prepare(
      'INSERT OR IGNORE INTO webhook_events (provider, event_id, received_at, payload) VALUES (?, ?, ?, ?)',
    ).run(provider.id, eventId, nowIso(), payloadJson);
  };

  const payment = db
    .prepare('SELECT * FROM payments WHERE provider = ? AND provider_transaction_id = ?')
    .get(provider.id, transactionId) as PaymentRow | undefined;
  if (!payment) {
    record(); // kept for ops review (possible orphan/attack probe)
    return { outcome: 'ignored', detail: 'unknown transaction' };
  }
  if (payment.status === 'PAID') {
    record();
    return { outcome: 'already-processed' };
  }

  // Authoritative re-query — webhook claims alone never complete a payment.
  let evidence: VerificationEvidence;
  try {
    evidence = await provider.verifyPayment(transactionId);
  } catch {
    // No record → provider retries the webhook; nothing half-applied.
    throw new ApiError(502, 'PROVIDER_ERROR', 'Provider verification unreachable.');
  }
  const result = applyVerification(db, payment, evidence, provider.expectedMode?.() ?? null);
  record();
  switch (result.action) {
    case 'completed':
      return { outcome: 'completed' };
    case 'already-paid':
      return { outcome: 'already-processed' };
    case 'failed':
      return { outcome: 'failed-recorded', detail: result.detail };
    case 'booking-invalid':
      return { outcome: 'failed-recorded', detail: result.detail };
    case 'not-payable':
      return { outcome: 'already-processed', detail: result.detail };
    default:
      return { outcome: 'pending' };
  }
}

/** Admin ledger: every payment attempt with booking + customer context. */
export function listPayments(
  db: Db,
  options: { limit: number; offset: number },
): { payments: PaymentLedgerItem[]; total: number } {
  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM payments').get() as { count: number };
  const rows = db
    .prepare(
      `SELECT p.*, b.booking_reference, b.customer_name, b.customer_phone, e.title AS event_title
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       JOIN events e ON e.id = b.event_id
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(options.limit, options.offset) as Array<
    PaymentRow & {
      booking_reference: string;
      customer_name: string;
      customer_phone: string;
      event_title: string;
    }
  >;
  return {
    total: totalRow.count,
    payments: rows.map((r) => ({
      id: r.id,
      bookingReference: r.booking_reference,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      eventTitle: r.event_title,
      paymentMethod: r.payment_method,
      provider: r.provider,
      providerTransactionId: r.provider_transaction_id,
      providerReference: r.provider_reference,
      providerMethod: r.provider_method,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      failureReason: r.failure_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      verifiedAt: r.verified_at,
    })),
  };
}
