# Render TEST deployment runbook (public HTTPS)

Deploys the app as ONE service from `render.yaml`. Do all steps in order.
Nothing here creates the Chapa dashboard webhook — that is a later step.

## 0. Prerequisites (not available in this workspace)

- A Render account with the repo connected (paid instance required: persistent
  disks are not available on free instances).
- No Chapa credentials yet — the service runs first with every payment method
  honestly “Coming soon”.

## 1. Create the service

Render Dashboard → New → Blueprint → select this repo (`render.yaml`).
When prompted for `sync: false` values:

- `JWT_SECRET`: generate locally —
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_PASSWORD`: a strong unique password.
- `CHAPA_SECRET_KEY`: leave empty for now (app treats empty as unconfigured).
  Paste the Chapa **test** secret here only when it arrives. Never a live key.

## 2. Seed (one-off, after first boot)

Render Dashboard → service → Shell:

```sh
npm run db:seed
```

Idempotent: creates the admin user + premiere event only if missing. It never
touches payments (verified: no payment code in `server/src/seed.ts`).

## 3. Verify the deployment

Open in a browser (replace with the real Render URL):

- `https://<service>.onrender.com/api/events` → premiere event JSON.
- `https://<service>.onrender.com/api/payments/methods` → all five methods
  `available: false` (expected: no secret + no allowlist yet).
- `https://<service>.onrender.com/` → the site; `/book` shows the coming-soon
  reserve flow; `/admin` login works with the seeded admin.

## 4. After Chapa test credentials arrive (later — not now)

1. Dashboard → Environment → set `CHAPA_SECRET_KEY` to the **test** secret
   (keep `CHAPA_MODE=test`), save (redeploys).
2. Register the webhook URL in the Chapa dashboard:
   `https://<service>.onrender.com/api/payments/webhook/chapa`
3. Run one real test checkout per rail; confirm the ledger row flips `PAID`
   and the ticket validates `VALID`.
4. Only then add that rail's code to `PAYMENT_METHODS` (comma-separated,
   e.g. `TELEBIRR`), one rail at a time, redeploying between rails.

## Reference

- Build: `npm ci && npm run build` · Start: `npm start` · Node 22.
- SQLite lives at `/var/data/harar-cinema.db` on the `harar-cinema-data` disk
  (1 GB) — bookings, payments, tickets, and admin data survive redeploys.
- Webhook endpoint (fixed): `POST /api/payments/webhook/chapa`.
- Secrets live only in dashboard env vars — never in `render.yaml`, `VITE_*`,
  or source. `PAYMENT_METHODS` stays empty until a rail proves itself.
