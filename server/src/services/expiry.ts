/**
 * Lazy booking expiry (no background worker needed). Stale PENDING bookings
 * past their payment deadline are expired and their seats released. Called
 * from its own transaction before capacity-sensitive reads/writes — never
 * nested inside another transaction.
 */
import type { Db } from '../db/connection';
import type { BookingRow } from '../db/types';

export function isBookingExpired(booking: BookingRow, nowIso: string): boolean {
  return (
    booking.status === 'PENDING' && !!booking.expires_at && booking.expires_at < nowIso
  );
}

/** Expire one booking: EXPIRED + payment EXPIRED + tickets cancelled + seats freed. */
export function expireOneBooking(db: Db, booking: BookingRow, nowIso: string): void {
  db.prepare(`UPDATE bookings SET status = 'EXPIRED', updated_at = ? WHERE id = ?`).run(
    nowIso,
    booking.id,
  );
  db.prepare(
    `UPDATE payments SET status = 'EXPIRED', updated_at = ? WHERE booking_id = ? AND status = 'PENDING'`,
  ).run(nowIso, booking.id);
  db.prepare(
    `UPDATE tickets SET status = 'CANCELLED', updated_at = ? WHERE booking_id = ? AND status = 'PENDING'`,
  ).run(nowIso, booking.id);
  db.prepare(`UPDATE events SET reserved_seats = reserved_seats - ?, updated_at = ? WHERE id = ?`).run(
    booking.quantity,
    nowIso,
    booking.event_id,
  );
}

/** Sweep all stale bookings. Returns the number expired. Idempotent. */
export function expireStaleBookings(db: Db, nowIso?: string): number {
  const now = nowIso ?? new Date().toISOString();
  const run = db.transaction(() => {
    const stale = db
      .prepare(
        `SELECT * FROM bookings WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at < ?`,
      )
      .all(now) as BookingRow[];
    for (const booking of stale) expireOneBooking(db, booking, now);
    return stale.length;
  });
  return (run as unknown as { immediate: () => number }).immediate();
}
