-- 001_initial_schema.sql — Harar Open Air Cinema core schema (PostgreSQL).
--
-- Money is stored as INTEGER birr (tickets are whole-birr amounts).
-- Dates/times are display labels exactly as printed on the official poster
-- (Ethiopian calendar / local time), NOT gregorian timestamps.
-- created_at/updated_at/validated_at are ISO-8601 UTC strings.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  movie_title TEXT NULL,
  movie_poster TEXT NULL,
  movie_trailer TEXT NULL,
  movie_synopsis TEXT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  venue_location TEXT NOT NULL,
  ticket_price INTEGER NOT NULL CHECK (ticket_price >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  reserved_seats INTEGER NOT NULL DEFAULT 0
    CHECK (reserved_seats >= 0 AND reserved_seats <= capacity),
  free_snack INTEGER NOT NULL DEFAULT 1 CHECK (free_snack IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  booking_reference TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL UNIQUE,
  qr_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'USED', 'CANCELLED')),
  validated_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_booking ON tickets(booking_id);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'STAFF')),
  created_at TEXT NOT NULL
);

-- Lets safe clients retry POST /api/bookings without double-booking.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
