# Payment architecture (Phase 3)

Real Ethiopian payment collection for eBirr, Coopay, CBE, telebirr, and mobile
banking at 250 ETB/ticket, built on Phase 2 without redesigning the customer UI.

Provider research (options, evidence, limitations) lives in
[`payment-research.md`](./payment-research.md). This document describes what was
built and the rules it enforces.

## Decision

**Single aggregator: Chapa.** No directly accessible public merchant API could
be confirmed for CBE, eBirr, or Coopay, so each requested method is served
through Chapa's hosted checkout, which documents telebirr, CBEBirr / CBE Bank
Transfer, eBirr / Coopay-Ebirr, COOP, bank + card rails among its payment
methods. The code is provider-independent (`PaymentProvider`), so a future
direct integration only adds an adapter — no booking/ticket changes.

- No credentials exist yet. With `CHAPA_SECRET_KEY` empty, **every method
  reports `available: false` and the UI shows “Coming soon”** — nothing claims
  to work that cannot work.
- Availability is a triple gate: a method is advertised only when (a) a
  provider supports it, (b) that provider is configured (secret present), AND
  (c) the operator lists it in `PAYMENT_METHODS` after confirming it on the
  merchant's real checkout. Chapa enables rails per merchant account and
  documents no API to query them, so (c) cannot be automated — the default is
  to advertise nothing. The gate is enforced in the registry, so direct API
  calls with unconfirmed methods are rejected (`409 PAYMENT_NOT_PAYABLE`) and
  the frontend (which renders `/api/payments/methods` verbatim) can never
  show an unconfirmed method as operational.
- Chapa's initialize call takes no per-method parameter, so the customer
  selects a preferred method (recorded on the payment), pays on Chapa's
  checkout, and the backend records the rail Chapa actually used
  (`providerMethod`) after verification.

## Money lifecycle

```
booking PENDING + UNPAID, tickets PENDING (gate: INVALID, paymentPending)
        │  POST /api/bookings/:ref/payment   (server prices from DB)
        ▼
payment PENDING ──redirect──▶ Chapa hosted checkout ──customer pays──┐
        │                                                             │
        │  completes ONLY via server-side proof:                      │
        │   (a) signed webhook + independent verify re-query, or      │
        │   (b) explicit verify pull (return page / retry)             │
        ▼                                                             │
payment PAID ──same transaction──▶ booking CONFIRMED/PAID, tickets ACTIVE
```

Gate rule: only `ACTIVE` tickets from `CONFIRMED` bookings validate. `PENDING`
tickets are `INVALID` with `paymentPending: true` (“payment has not been
verified — do not admit”). QR payloads stay opaque (`harar-cinema://ticket/<token>`).

Bookings carry `expires_at` (default 30 min). Stale `PENDING` bookings are
swept lazily (before capacity-sensitive reads/writes — no worker needed):
booking → `EXPIRED`, payment → `EXPIRED`, tickets → `CANCELLED`, seats released.

## Completion rules (all enforced in `PaymentService`)

1. **Amounts are server-calculated** (`ticket_price × quantity`). Client money
   input does not exist.
2. **Redirects/callbacks never complete payment.** The provider callback only
   redirects to `/pay/return`; completion requires provider evidence.
3. **Webhooks authenticate first** (HMAC-SHA256 per Chapa docs), then the
   backend **re-queries verify** before crediting — webhook claims alone never
   complete a payment.
4. **Completion checks, inside one transaction:** verdict PAID, currency ETB,
   amount exactly equals the booking total, provider mode matches configured
   mode, booking still `PENDING` and unexpired. Any mismatch → payment
   `FAILED`/`EXPIRED`, **no activation**.
5. **Failures are non-destructive:** `FAILED` keeps the booking `PENDING` so
   the customer can retry with a fresh provider reference. Unknown webhook
   transactions are recorded for ops review and ignored.
6. **Idempotent everywhere:** webhook event ids are recorded (`already-processed`
   replays); completion is a single guarded transaction (double webhooks /
   double verify pulls complete once); booking creation keeps its
   `Idempotency-Key` behavior.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/payments/methods` | 5 methods + availability (provider ∩ operator allowlist) |
| POST | `/api/bookings/:ref/payment` | Initiate (validates, prices, returns checkout URL only) |
| GET | `/api/bookings/:ref/payment?phone=` | Status view (phone must match; read-only) |
| POST | `/api/bookings/:ref/payment/verify` | Server-side re-verify (return-from-payment path) |
| GET | `/api/payments/callback/:provider` | Customer redirect → `/pay/return` (no state change) |
| POST | `/api/payments/webhook/:provider` | Signed + idempotent; 200 always, 502 only when the verify re-query is unreachable (provider retries) |
| GET | `/api/admin/payments` | Ledger: attempts + provider refs, never secrets |

Rate limits: payment initiation/verify 30 per 10 min per IP (plus existing auth
limits). Initiation/webhook payloads are size-capped.

## Key files

- `server/src/services/payments/types.ts` — `PaymentProvider` abstraction (initiate, verify, signed webhook parse)
- `server/src/services/payments/chapa.ts` — Chapa adapter (docs-derived URLs/fields only)
- `server/src/services/payments/registry.ts` — provider set + method availability
- `server/src/services/payments/service.ts` — `PaymentService`: initiate, verify pull, webhook core, completion engine, ledger
- `server/src/services/expiry.ts` — lazy expiry sweeps
- `server/src/db/migrations/002_payments.sql` — `payments`, `webhook_events`, `expires_at`, `PENDING` tickets
- `src/components/BookingFlow.tsx` — method picker + initiate/redirect (reserve-only fallback)
- `src/pages/PayReturnPage.tsx` — verified-status return page (poll + re-verify + real QR tickets)
- `src/components/QrCode.tsx` — real QR (verified bookings only; previews keep the placeholder)
- `src/pages/admin/PaymentsPage.tsx` — ledger UI

## Security

- Secrets (`CHAPA_SECRET_KEY`, …) are server-side env vars only — never in
  `VITE_*`, never in responses, never committed (`.env.example` is a blank template).
- Webhook HMAC uses timing-safe comparison over raw bytes; failures are 401
  with zero state change.
- Status/verify endpoints require the booking phone; wrong phone returns the
  same 404 as an unknown reference.
- No `VITE_` payment secrets exist; the frontend only ever receives a checkout
  URL + public refs.

## Testing

`npm run test:server` (53 tests): full pipeline over HTTP against a test-only
stub provider — initiation pricing, method validation, duplicates/double-pay,
verify-pull completion, webhook completion + idempotency + tampered-signature
rejection, amount/currency mismatch fail-closed, expiry + seat release, ledger
auth. `tests/chapa.test.ts` pins the adapter's mapping to documented Chapa
shapes (network stubbed). No real rail is touched; no sandbox success is faked.

## External setup (when the organizers are ready)

1. Create a Chapa merchant account and complete business verification.
2. In test mode, copy the test **secret** key → `CHAPA_SECRET_KEY`, keep
   `CHAPA_MODE=test`.
3. Set `PUBLIC_API_URL` to the publicly reachable API base (webhooks +
   customer callback) and `PUBLIC_BASE_URL` to the site URL; register
   `<PUBLIC_API_URL>/api/payments/webhook/chapa` as the webhook URL and the
   callback URL pattern in the Chapa dashboard.
4. Run a test checkout end-to-end; confirm the ledger row flips `PAID` and
   tickets validate `VALID`.
5. For EACH requested method, confirm its rail actually appears and completes
   in the merchant checkout, then add that code to `PAYMENT_METHODS` and
   redeploy. Never list a method that has not completed a real checkout.
6. For launch: swap to the live secret, set `CHAPA_MODE=live`, re-verify —
   live rails can differ from test rails, so re-confirm every `PAYMENT_METHODS`
   entry on the live checkout.

## Not implemented (deliberate)

- **Refunds** — no refund API was found in the reviewed Chapa docs; the
  `REFUNDED` enum value exists only as a frontend display state.
- **Per-method checkout parameters** — Chapa's initialize takes no method
  selector; the method is recorded as preference and confirmed post-payment.
- **Provider push rails / direct bank APIs** — no official docs found; mobile
  banking is served via the aggregator's bank/card rails only.
- **Sandbox E2E** — no credentials exist, so no live test-mode run has been
  performed; the adapter is pinned to documented shapes by unit tests instead.
