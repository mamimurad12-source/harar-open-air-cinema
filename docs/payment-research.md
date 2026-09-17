# Payment Provider Research — Harar Open Air Cinema (Phase 3)

Researched September 2026 from official documentation. Nothing below is assumed:
where official docs were unavailable, it is stated explicitly.

## Decision (TL;DR)

**Single aggregator: Chapa** (`https://developer.chapa.co`). One documented API
covers all five requested methods — Telebirr, CBE, eBirr, Coopay and bank/card
rails (“Mobile Banking”) — through Chapa’s hosted checkout, with server-side
verification and signed webhooks. No direct public merchant API was found for
eBirr, Coopay or CBE, so per-method direct integrations are not possible without
private merchant contracts. Chapa is the smallest reliable integration surface
that preserves backend verification for every method.

Method mapping (all via the Chapa adapter; availability = Chapa configured):

| Requested method | Chapa rail (per official payment-methods page) |
|---|---|
| TELEBIRR | telebirr wallet |
| CBE | CBE Bank Transfer and/or CBEBirr |
| EBIRR | eBirr / Coopay-Ebirr |
| COOPAY | COOP (Cooperative Bank of Oromia) / Coopay-Ebirr |
| MOBILE_BANKING | Aggregator bank rails: CBE/Awash/Enat/Amhara/BOA bank transfer + cards. This is NOT a per-bank integration — the customer picks their bank inside Chapa’s checkout. Individual banks are never presented as directly integrated. |

Important honesty note: Chapa’s initialize API takes no per-method parameter —
the customer chooses the wallet/bank on Chapa’s hosted checkout page. Our
`payment_method` records the customer’s stated preference (validated enum);
verification records the **actual** method Chapa reports. Any successful Chapa
payment for our transaction (amount + currency + mode verified) confirms the
booking, whichever rail the customer used. The UI labels checkout as secured
via the aggregator.

## eBirr

- Official integration availability: no public self-serve merchant API or
  developer portal found.
- Merchant requirements / KYC / API availability / sandbox / fees: not
  publicly documented — requires a private merchant arrangement (unknown terms).
- Supported path: **aggregator (B)** — Chapa lists eBirr/Coopay-Ebirr as a
  pay-in method with ETB support (1 ETB minimum), initialized and verified
  through the Chapa API below.

## Coopay (Cooperative Bank of Oromia)

- Official integration availability: no public merchant API or developer
  portal found (OpenBankingTracker lists no integrations/APIs for the bank).
- Merchant requirements / KYC / API / sandbox / fees: not publicly documented.
- Supported path: **aggregator (B)** — Chapa lists COOP bank rails and
  Coopay-Ebirr (ETB, 1 ETB minimum).

## CBE (Commercial Bank of Ethiopia)

- Official integration availability: no public developer portal or merchant
  API documentation found. (Third-party receipt-verifier tools exist but are
  screen-scraping style workarounds, not an official integration — not used.)
- Merchant requirements / KYC / API / sandbox / fees: not publicly documented.
- Supported path: **aggregator (B)** — Chapa lists CBE Bank Transfer
  (1–9,999,999 ETB) and CBEBirr (1–150,000 ETB).

## Telebirr (Ethio Telecom)

- Official integration availability: “Fabric Payment API” exists for contracted
  merchants (community integrations reference
  `developerportal.ethiotelebirr.et`), using RSA-signed requests, merchant
  codes and notify URLs. No public self-serve docs or sandbox were found;
  access requires a direct merchant contract + KYC with Ethio Telecom.
- Merchant requirements: business license + verification via the Telebirr team
  (per community docs), credentials issued after approval.
- Supported path chosen: **aggregator (B)** — Chapa lists telebirr
  (1–75,000 ETB pay-in). A direct Telebirr adapter remains possible later
  through the `PaymentProvider` interface if the organizers obtain a direct
  merchant contract — no booking code would change.

## Mobile Banking (what it technically means)

“Mobile Banking” is not one integration. Technically it resolves to **bank
transfer + card rails inside the aggregator checkout**: Chapa lists CBE, Awash,
Enat, Amhara and BOA bank pay-in rails plus credit/debit cards. Our
`MOBILE_BANKING` method therefore means “pay from any supported Ethiopian bank
via the aggregator checkout,” with the actual bank recorded at verification
time. No bank is presented as individually integrated.

## Chapa — documented API surface (all from developer.chapa.co)

- Base: `https://api.chapa.co/v1`, auth `Authorization: Bearer <secret>`.
- Initialize: `POST /transaction/initialize` with `amount`, `currency` (ETB),
  `tx_ref` (must be unique — reuse returns 400), customer fields, `phone_number`
  (optional, must be 10-digit `09…`/`07…` if sent), `callback_url`, `return_url`,
  `customization`, `meta`. Success returns `data.checkout_url`
  (`https://checkout.chapa.co/checkout/payment/…`) — redirect the customer there.
- Verify: `GET /transaction/verify/<tx_ref>` → `data` with `status`
  (`success`/`pending`/`failed`), `amount`, `currency`, `tx_ref`, `reference`,
  `method`, `mode`. Docs explicitly instruct: verify from the callback handler
  and confirm status/amount/currency/tx_ref/mode before giving value.
- Customer callback: `GET callback_url?trx_ref&ref_id&status` — hint only,
  never trusted without verification.
- Webhooks: opt-in dashboard URL; `POST` JSON `{event: charge.success|…,
  tx_ref, reference, amount, currency, status, mode, payment_method, …}`;
  authenticity via `chapa-signature` / `x-chapa-signature` = HMAC-SHA256 (hex)
  of the JSON payload with the secret key; must return `200` (retries every
  10 min, 10 attempts, 72 h). Docs require idempotent handling + re-querying
  the verify endpoint before crediting.
- Test mode: dashboard toggle; test keys prefixed `CHAPUBK_TEST-…`; test cards
  and test mobile numbers only; webhooks still delivered in test mode.
- Refunds: `charge.refunded` webhook event exists, but no programmatic refund
  API was found in the docs — **refunds are not implemented** (manual via the
  Chapa dashboard; documented as a limitation).
- Fees: no official fee schedule found in the developer docs — per merchant
  agreement; confirm in the Chapa dashboard during onboarding.

## Alternatives considered (not implemented)

- **Arifpay** (developer.arifpay.net) — licensed gateway with a developer
  portal, sandbox and APIs. Viable second adapter later; not needed since
  Chapa already covers every requested method.
- **AddisPay / SantimPay / Yenepay** — other Ethiopian gateways; same reasoning.
- **Direct Telebirr (Fabric API)** — possible only with a private Ethio Telecom
  merchant contract; revisit if the organizers obtain one.

## External setup required (organizer, outside the codebase)

1. Chapa merchant account at dashboard.chapa.co (trade license, TIN, business
   bank account; review quoted as days, not weeks).
2. API keys (test immediately; live after KYC approval) → `CHAPA_SECRET_KEY`,
   `CHAPA_MODE`.
3. Public HTTPS `callback_url` + webhook URL registered in the dashboard
   (webhook secret = your secret key per Chapa’s scheme).
4. Test-mode validation with Chapa test numbers/cards before go-live.
5. No Chapa credentials exist yet — until they are provided, all five methods
   correctly display **“Coming soon.”**

Sources: [1](https://developer.chapa.co/integrations/accept-payments)
[2](https://developer.chapa.co/integrations/verify-payments)
[3](https://developer.chapa.co/integrations/webhooks)
[4](https://developer.chapa.co/integrations/test-mode-vs-live-mode)
[5](https://developer.chapa.co/integrations/responses)
[6](https://developer.chapa.co/payment-methods)
[7](https://developer.arifpay.net/)
[8](https://github.com/Solomonkassa/Nodejs-Telebirr-Integration)
