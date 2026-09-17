/**
 * Lazy booking expiry (no background worker needed). Stale PENDING bookings
 * past their payment deadline are expired and their seats released. Called
 * from its own transaction before capacity-sensitive reads/writes — never
 * nested inside another transaction.
 *
 * The sweep locks the rows it expires (`FOR UPDATE`): a payment completing
 * for the same booking either commits first (sweep then sees a CONFIRMED
 * booking and skips it) or waits and then finds no stale row. Either order
 * is safe, and any lock-order deadlock with completion is retried by the
 * transaction helper.
 */
import type { Db, RootDb } from '../db/connection';
import type { BookingRow } from '../db/types';

export function isBookingExpired(booking: BookingRow, nowIso: string): boolean {
  return (
    booking.status === 'PENDING' && !!booking.expires_at && booking.expires_at < nowIso
  );
}

/** Expire one booking: EXPIRED + payment EXPIRED + tickets cancelled + seats freed. */
export async function expireOneBooking(db: Db, booking: BookingRow, nowIso: string): Promise<void> {
  await db.run(`UPDATE bookings SET status = 'EXPIRED', updated_at = $1 WHERE id = $2`, [
    nowIso,
    booking.id,
  ]);
  await db.run(
    `UPDATE payments SET status = 'EXPIRED', updated_at = $1 WHERE booking_id = $2 AND status = 'PENDING'`,
    [nowIso, booking.id],
  );
  await db.run(
    `UPDATE tickets SET status = 'CANCELLED', updated_at = $1 WHERE booking_id = $2 AND status = 'PENDING'`,
    [nowIso, booking.id],
  );
  await db.run(`UPDATE events SET reserved_seats = reserved_seats - $1, updated_at = $2 WHERE id = $3`, [
    booking.quantity,
    nowIso,
    booking.event_id,
  ]);
}

/** Sweep all stale bookings. Returns the number expired. Idempotent. */
export async function expireStaleBookings(db: RootDb, nowIso?: string): Promise<number> {
  const now = nowIso ?? new Date().toISOString();
  return db.transaction(async (tx) => {
    const stale = await tx.all<BookingRow>(
      `SELECT * FROM bookings WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at < $1 FOR UPDATE`,
      [now],
    );
    for (const booking of stale) await expireOneBooking(tx, booking, now);
    return stale.length;
  });
}
