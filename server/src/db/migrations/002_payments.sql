-- 002_payments.sql — payment records, webhook idempotency, booking expiry,
-- and PENDING ticket state (tickets activate only after verified payment).

-- Booking: chosen method + payment deadline.
ALTER TABLE bookings ADD COLUMN payment_method TEXT NULL
  CHECK (payment_method IS NULL
         OR payment_method IN ('EBIRR', 'COOPAY', 'CBE', 'TELEBIRR', 'MOBILE_BANKING'));
ALTER TABLE bookings ADD COLUMN expires_at TEXT NULL;
-- NOTE: the pre-Postgres edition backfilled expires_at on existing PENDING rows
-- with an SQLite date function. Every Postgres database starts fresh (new TEST
-- environment), so there is nothing to backfill; new bookings always set it.

-- Authoritative payment record (bookings.payment_status mirrors status here).
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('EBIRR', 'COOPAY', 'CBE', 'TELEBIRR', 'MOBILE_BANKING')),
  provider TEXT NOT NULL,
  -- Our unique transaction reference sent to the provider (tx_ref).
  provider_transaction_id TEXT NULL UNIQUE,
  -- Provider-side reference returned after payment (e.g. Chapa `reference`).
  provider_reference TEXT NULL,
  -- Actual rail used, as reported at verification (may differ from preference).
  provider_method TEXT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED')),
  failure_reason TEXT NULL,
  init_payload TEXT NULL,
  verify_payload TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_provider_tx ON payments(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Processed provider events → duplicate webhooks replay safely.
CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload TEXT NULL,
  PRIMARY KEY (provider, event_id)
);

-- Tickets gain PENDING (booked, unpaid). Existing unpaid ACTIVE tickets move
-- to PENDING — nothing paid exists yet, so nothing loses validity.
ALTER TABLE tickets RENAME TO tickets_old;
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL UNIQUE,
  qr_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('PENDING', 'ACTIVE', 'USED', 'CANCELLED')),
  validated_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO tickets (id, booking_id, ticket_number, qr_token, status, validated_at, created_at, updated_at)
  SELECT id, booking_id, ticket_number, qr_token,
         CASE WHEN status = 'ACTIVE' THEN 'PENDING' ELSE status END,
         validated_at, created_at, updated_at
  FROM tickets_old;
DROP TABLE tickets_old;
CREATE INDEX idx_tickets_booking ON tickets(booking_id);
