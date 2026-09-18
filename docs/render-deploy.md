# Render TEST deployment runbook (public HTTPS, $0)

Deploys the app as ONE free service from `render.yaml`, with Postgres on
Neon's permanent free tier. Do all steps in order. Nothing here creates the
Chapa dashboard webhook — that is a later step.

## 0. Prerequisites (not available in this workspace)

- A Render account with the repo connected (free instance — no card needed).
- A Neon account (free tier — no card needed): create one project + database,
  and copy its **direct** connection string (the pooled string can hold idle
  transactions oddly; the direct one already ends in `?sslmode=require`).
- No Chapa credentials yet — the service runs first with every payment method
  honestly “Coming soon”.

## 1. Create the service

Render Dashboard → New → Blueprint → select this repo (`render.yaml`).
When prompted for `sync: false` values:

- `DATABASE_URL`: the Neon direct connection string from step 0.
- `JWT_SECRET`: generate locally —
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_PASSWORD`: a strong unique password.
- `CHAPA_SECRET_KEY`: leave empty for now (app treats empty as unconfigured).
  Paste the Chapa **test** secret here only when it arrives. Never a live key.

## 2. Seed (automatic — no Shell needed)

Seeding happens at **app boot**: after migrations and before the server
listens, `index.ts` runs the idempotent `seedDatabase()` (`server/src/seed.ts`),
so a fresh database always has its premiere event + admin user from the very
first deploy — no Shell access, no dashboard setting, and no dependence on
Blueprint sync. `render.yaml` additionally sets
`preDeployCommand: npm run db:seed` as redundant safety for Blueprint-managed
services; running both is harmless (the second is a no-op).

The seed creates the admin user + premiere event only if missing. It never
touches payments (verified: no payment code in `server/src/seed.ts`), never
overwrites existing rows, and never touches customer bookings. Locally, the
same seed runs on `npm run dev:server` / `npm start`, or standalone via:

```sh
npm run db:seed
```

## 2b. Admin password reset (no Shell needed)

Forgotten password? The seed never overwrites an existing admin, so changing
`ADMIN_PASSWORD` alone does nothing. Instead:

1. Dashboard → Environment → set `ADMIN_PASSWORD` to the new secret.
2. Add `ADMIN_PASSWORD_RESET=true` (exact value) → this triggers a redeploy.
3. After deploy, log in at `/admin` with the new password to verify.
4. **Remove** `ADMIN_PASSWORD_RESET` → redeploy. The password stays; the
   switch must not remain armed.

Scope: updates only the existing seed admin's password hash (bcrypt);
never creates/deletes accounts, never touches events, bookings, or payments.
With the flag absent (normal state), boot behavior is unchanged.

## 3. Verify the deployment

Open in a browser (replace with the real Render URL):

- `https://<service>.onrender.com/api/events` → premiere event JSON.
- `https://<service>.onrender.com/api/payments/methods` → all five methods
  `available: false` (expected: no secret + no allowlist yet).
- `https://<service>.onrender.com/` → the site; `/book` shows the coming-soon
  reserve flow; `/admin` login works with the seeded admin.

Free-tier behavior (expected, not errors): the first request after ~15 minutes
of idleness takes 30–60 s (Render wakes the sleeping service; Neon compute
wakes in milliseconds). After that it is fast until the next idle period.

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
- Data lives in Neon Postgres (permanent free tier): bookings, payments,
  tickets, and admin data survive redeploys and idle sleeps. No disk needed.
- Webhook endpoint (fixed): `POST /api/payments/webhook/chapa`.
- Secrets live only in dashboard env vars — never in `render.yaml`, `VITE_*`,
  or source. `PAYMENT_METHODS` stays empty until a rail proves itself.
