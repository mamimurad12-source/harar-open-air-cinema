# Harar Open Air Cinema

Mobile-first event website + real booking backend for the open-air cinema night
at the **Arthur Rimbaud Museum, Harar, Ethiopia**.

| Layer    | Stack                                                      |
|----------|------------------------------------------------------------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 (Vite)              |
| Backend  | Express 5 + TypeScript (tsx)                               |
| Database | PostgreSQL 17 + versioned migrations                      |
| Auth     | bcrypt passwords + JWT in httpOnly cookies                 |
| Tests    | node:test + supertest (73 backend tests)                   |

## Quick start

```bash
docker compose up -d        # local Postgres 17 (or point DATABASE_URL elsewhere)
npm install
cp .env.example .env        # then review the values
npm run db:seed             # create event + admin user
npm run dev:all             # web :5173 + api :3001 together
```

Open http://localhost:5173 — the site, booking flow and admin area all run
against the real database. Admin login: the `ADMIN_EMAIL` / `ADMIN_PASSWORD`
from your `.env` (dev defaults: `admin@harar-cinema.local` / `change-me-dev-admin`).

The backend test suite needs its own Postgres server + maintenance database to
clone from: set `TEST_DATABASE_URL` (see `.env.example`) before
`npm run test:server` — every test creates and drops its own isolated database.

## Project architecture

```
harar-cinema/
├── src/                    # React frontend (customer site + admin screens)
│   ├── components/         # Reusable UI (Hero, BookingFlow, DigitalTicket…)
│   ├── pages/              # Route compositions (+ pages/admin/*)
│   ├── lib/
│   │   ├── api.ts          # EventsApi contract: HttpEventsApi (real) +
│   │   │                   # MockEventsApi (VITE_USE_MOCK_API=true dev only)
│   │   ├── adminAuth.ts    # Admin session client
│   │   ├── booking.ts      # Booking draft rules (imports shared validation)
│   │   └── useEvent.ts     # Data hooks (components never touch data directly)
│   ├── data/event.ts       # Seed-shaped types + FAQ content
│   └── config/site.ts      # Brand, nav, social placeholders
├── shared/
│   └── validation.ts       # Phone/name rules shared by frontend AND backend
├── server/
│   ├── src/
│   │   ├── index.ts        # Entry: API (+ serves dist/ in production)
│   │   ├── app.ts          # Express factory (tests use isolated PG DBs)
│   │   ├── config.ts       # Env-driven config (dev fallbacks, strict in prod)
│   │   ├── db/             # connection.ts, migrate.ts, types.ts, migrations/
│   │   ├── lib/            # ids, errors, auth (bcrypt/JWT), rateLimit, http
│   │   ├── middleware/     # requireAdmin (protects every /api/admin/* route)
│   │   ├── services/       # bookingService (transactions), ticketService,
│   │   │                   # adminService, dto mappers
│   │   ├── routes/         # publicEvents, publicBookings, admin{Auth,Events,…}
│   │   └── seed.ts         # `npm run db:seed`
│   └── tests/              # bookings, tickets, admin, payments, chapa, pg-concurrency
├── public/poster.jpg       # Official event poster (shown on /event)
├── docker-compose.yml      # local Postgres 17 for development
└── render.yaml             # Render Blueprint ($0 TEST: free web + Neon Postgres)
```

## Development commands

| Command                | What it does                                        |
|------------------------|-----------------------------------------------------|
| `npm run dev`          | Frontend only (:5173, proxies `/api` → :3001)       |
| `npm run dev:server`   | API only with auto-reload (:3001)                   |
| `npm run dev:all`      | Both together                                       |
| `npm run db:seed`      | Migrate + seed event + admin (idempotent)           |
| `npm run test:server`  | Backend test suite (fresh Postgres DB per test)    |
| `npm run typecheck`    | `tsc` for server + frontend                         |
| `npm run build`        | Server typecheck + frontend typecheck + Vite build  |
| `npm start`            | Production: API serving API + built site, one port  |

## Environment variables

See `.env.example`. Summary:

| Variable        | Purpose                                              |
|-----------------|------------------------------------------------------|
| `PORT`          | API port (default 3001)                              |
| `DATABASE_URL`  | Postgres connection string (default: local compose)  |
| `TEST_DATABASE_URL` | Tests-only server for per-test databases     |
| `JWT_SECRET`    | Session signing secret — **required in production**  |
| `ADMIN_*`       | Seed admin name/email/password for `db:seed`         |
| `VITE_API_BASE` | API base for the frontend (default same-origin `/api`) |
| `VITE_USE_MOCK_API` | `true` → pure-frontend demo mode (no backend)    |

Never commit `.env` — it is git-ignored.

## Database

PostgreSQL 17 behind a small `pg` pool (TLS comes from the connection
string's `sslmode=require`). Schema lives in versioned files under
`server/src/db/migrations/` and is applied automatically on boot
(`schema_migrations` tracks what ran; Postgres runs each migration file
transactionally).

Tables: `events`, `bookings`, `tickets`, `admin_users`, `idempotency_keys`,
`payments`, `webhook_events`.

Key integrity rules (enforced by the database itself, not just code):

- `events.reserved_seats <= events.capacity` (CHECK) — overselling is
  unrepresentable, whatever the code does.
- `tickets.qr_token` / `ticket_number` / `bookings.booking_reference` UNIQUE.
- Status columns use CHECK enums: bookings `PENDING|CONFIRMED|CANCELLED|EXPIRED`,
  booking payments `UNPAID|PENDING|PAID|FAILED|REFUNDED`, payment attempts
  `PENDING|PAID|FAILED|EXPIRED|CANCELLED`, tickets `PENDING|ACTIVE|USED|CANCELLED`.
- Foreign keys: bookings → events (RESTRICT), tickets → bookings (CASCADE).

### Oversell protection

`createBooking` locks the event row (`SELECT … FOR UPDATE`) inside its
transaction, then reserves seats with one atomic conditional update
(`SET reserved_seats = reserved_seats + $1 WHERE … reserved_seats + $1 <=
capacity`). Concurrent requests serialize on the row lock; losers get `409
INSUFFICIENT_CAPACITY` / `SOLD_OUT` with the live `remaining` count. Covered
by a 20-way concurrent test that asserts exactly `capacity` bookings win,
plus `pg-concurrency` proofs for the payment and gate races.

### Idempotent bookings

`POST /api/bookings` accepts an `Idempotency-Key` header. The key is pre-claimed
before the transaction, so retried/double-submitted requests replay the single
original booking instead of charging twice. The frontend generates one key per
booking attempt.

## API endpoints

Public:

| Method | Path                              | Notes                                    |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/api/events`                     | Published events with availability       |
| GET    | `/api/events/:id`                 | Published event detail + availability    |
| POST   | `/api/bookings`                   | Create PENDING/UNPAID booking + tickets  |
| GET    | `/api/bookings/:ref?phone=...`    | Booking + tickets (phone must match)     |
| GET    | `/api/payments/methods`           | Method availability (coming soon if off) |
| POST   | `/api/bookings/:ref/payment`      | Initiate payment → checkout URL          |
| GET    | `/api/bookings/:ref/payment?...`  | Status view (phone must match)           |
| POST   | `/api/bookings/:ref/payment/verify` | Server-side re-verify with provider    |
| GET    | `/api/payments/callback/:provider` | Customer redirect (never pays)          |
| POST   | `/api/payments/webhook/:provider` | Signed, idempotent provider webhook      |

Errors are `{ error: { code, message, details } }` with codes like
`INVALID_PHONE`, `INVALID_QUANTITY`, `SOLD_OUT`, `INSUFFICIENT_CAPACITY`,
`EVENT_NOT_AVAILABLE`, `BOOKING_NOT_FOUND`.

Admin (cookie session required, else `401 UNAUTHORIZED`):

| Method | Path                              | Notes                                    |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/api/admin/login`                | Rate-limited; sets httpOnly cookie       |
| POST   | `/api/admin/logout`               | Clears the session cookie                |
| GET    | `/api/admin/me`                   | Current admin (safe fields only)         |
| GET    | `/api/admin/events`               | All events incl. drafts                  |
| POST   | `/api/admin/events`               | Create event (draft by default)          |
| GET    | `/api/admin/events/:id`           | Event + availability                     |
| PATCH  | `/api/admin/events/:id`           | Edit; capacity can't drop below reserved |
| GET    | `/api/admin/bookings`             | `?eventId=&limit=&offset=` + total       |
| GET    | `/api/admin/bookings/:ref`        | Detail incl. per-ticket status           |
| POST   | `/api/admin/tickets/validate`     | `{ token }` → explicit outcome           |
| GET    | `/api/admin/payments`             | Payment ledger (attempts + refs)         |

Validator outcomes: `VALID` (paid tickets only), `ALREADY_USED`,
`INVALID` (incl. `PENDING` tickets with `paymentPending: true` — payment not
verified, do not admit), `CANCELLED`. `ACTIVE → USED` flips via a conditional
update, so simultaneous scans admit exactly one guest. QR codes encode an
opaque `hct_…` token only — never customer data.

## Admin authentication

- Passwords hashed with bcrypt (cost 10); login compares against a dummy hash
  for unknown emails so responses don't leak which emails exist.
- Sessions are signed JWTs (12h) in `httpOnly`, `SameSite=Lax` cookies
  (`Secure` in production). JavaScript never sees the token.
- Every `/api/admin/*` route runs `requireAdmin`; the React admin shell only
  redirects to `/admin/login` for UX — it is not a security boundary.
- `/admin/login` is rate-limited (15 attempts / 10 min / IP).

## Payments — real integration (Chapa aggregator)

eBirr, Coopay, CBE, telebirr, and mobile banking are collected through Chapa's
hosted checkout (research: `docs/payment-research.md`; design:
`docs/payment-architecture.md`). With no `CHAPA_SECRET_KEY` configured, every
method reports unavailable and the UI honestly shows **“Coming soon”** — and
even with credentials, a method is advertised only after the operator confirms
it on the merchant's real checkout via `PAYMENT_METHODS`.

Flow: customer picks a method at review → server prices from the DB and creates
a `PENDING` payment → redirect to Chapa → provider confirms → backend completes
**only after server-side verification** (signed webhook + verify re-query, or
explicit verify pull): payment `PAID` → booking `CONFIRMED`/`PAID` → tickets
`ACTIVE` with scannable QRs on `/pay/return`. Frontend redirects can never mark
payment paid. Unpaid bookings expire after `PAYMENT_WINDOW_MINUTES` (seats
released). Secrets stay in server env vars — never in `VITE_*` or responses.

## Product rules enforced in code

- The movie title is **never invented** — `movie_title NULL` renders
  “Movie title coming soon” until `/admin/events` publishes it.
- Booking only creates **pending** reservations; the frontend never claims payment success — completion is server-side after provider verification.
- Unknown info renders “Details will be announced by the organizers.”
- Customer booking needs no account — just name + phone.
