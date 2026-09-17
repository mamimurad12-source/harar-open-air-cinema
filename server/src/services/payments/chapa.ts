/**
 * Chapa aggregator adapter — the ONE real provider integration.
 *
 * Every URL, header, parameter and response shape below comes from Chapa's
 * official docs (developer.chapa.co). It serves all five requested methods
 * through Chapa's hosted checkout (telebirr, CBEBirr/CBE transfer,
 * eBirr/Coopay-Ebirr, COOP, bank + card rails).
 *
 * Docs-derived facts used here:
 * - POST {base}/transaction/initialize (Bearer secret) → data.checkout_url
 * - GET  {base}/transaction/verify/<tx_ref> → data {status, amount, currency,
 *   tx_ref, reference, method, mode}
 * - Webhook POST JSON {event, tx_ref, reference, amount, currency, status,
 *   mode, payment_method}; authenticity = HMAC-SHA256 hex of the JSON payload
 *   with the secret key, in `chapa-signature` or `x-chapa-signature`.
 * - Docs order us to re-query verify before crediting, and to be idempotent.
 */
import crypto from 'node:crypto';
import type { PaymentMethod } from '../../db/types';
import type {
  InitiateContext,
  InitiateResult,
  PaymentProvider,
  VerificationEvidence,
  WebhookParseResult,
} from './types';

export interface ChapaConfig {
  secretKey: string;
  mode: 'test' | 'live';
  baseUrl: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface ChapaInitResponse {
  message?: string;
  status?: string;
  data?: { checkout_url?: string };
}

interface ChapaVerifyData {
  status?: string;
  amount?: number | string;
  currency?: string;
  tx_ref?: string;
  reference?: string;
  method?: string;
  mode?: string;
}

interface ChapaVerifyResponse {
  message?: string;
  status?: string;
  data?: ChapaVerifyData | null;
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** 10-digit local format Chapa requires (09…/07…); null when unusable. */
export function toChapaPhone(normalized: string): string | null {
  const digits = normalized.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('251')) local = `0${local.slice(3)}`;
  else if (/^[97]\d{8}$/.test(local)) local = `0${local}`;
  return /^0(9|7)\d{8}$/.test(local) ? local : null;
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0] ?? 'Guest', last_name: 'Guest' };
  return { first_name: parts[0] ?? 'Guest', last_name: parts.slice(1).join(' ') };
}

export class ChapaAdapter implements PaymentProvider {
  readonly id = 'chapa';
  readonly displayName = 'Chapa';
  readonly supportedMethods: readonly PaymentMethod[] = [
    'EBIRR',
    'COOPAY',
    'CBE',
    'TELEBIRR',
    'MOBILE_BANKING',
  ];

  constructor(
    private readonly config: ChapaConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured(): boolean {
    return this.config.secretKey.trim().length > 0;
  }

  expectedMode(): string | null {
    return this.config.mode;
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('Chapa is not configured (CHAPA_SECRET_KEY missing).');
    }
  }

  async createPayment(ctx: InitiateContext): Promise<InitiateResult> {
    this.requireConfigured();
    const { first_name, last_name } = splitName(ctx.customerName);
    const phone = toChapaPhone(ctx.customerPhone);
    const payload: Record<string, unknown> = {
      amount: String(ctx.amountBirr),
      currency: ctx.currency,
      tx_ref: ctx.transactionId,
      first_name,
      last_name,
      callback_url: ctx.callbackUrl,
      return_url: ctx.returnUrl,
      customization: {
        title: 'Harar Open Air Cinema',
        description: `${ctx.eventTitle} — booking ${ctx.bookingReference}`,
      },
      meta: { booking_reference: ctx.bookingReference, payment_reason: 'Cinema ticket' },
    };
    if (phone) payload.phone_number = phone;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error(`Chapa unreachable: ${(err as Error)?.message ?? 'network error'}`);
    }
    const body = (await res.json().catch(() => null)) as ChapaInitResponse | null;
    const checkoutUrl = body?.data?.checkout_url;
    if (!res.ok || body?.status !== 'success' || !checkoutUrl) {
      throw new Error(
        `Chapa initialize failed (${res.status}): ${body?.message ?? 'unknown error'}`,
      );
    }
    return { checkoutUrl, audit: { status: body.status, message: body.message } };
  }

  async verifyPayment(transactionId: string): Promise<VerificationEvidence> {
    this.requireConfigured();
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.config.baseUrl}/transaction/verify/${encodeURIComponent(transactionId)}`,
        { headers: { Authorization: `Bearer ${this.config.secretKey}` } },
      );
    } catch (err) {
      throw new Error(`Chapa unreachable: ${(err as Error)?.message ?? 'network error'}`);
    }
    const body = (await res.json().catch(() => null)) as ChapaVerifyResponse | null;
    const data = body?.data ?? undefined;

    // Auth failures are configuration errors — surface them, never silent-pending.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Chapa verify unauthorized (${res.status}): ${body?.message ?? 'check CHAPA_SECRET_KEY'}`,
      );
    }
    // Docs: 404 "Payment not paid yet" / "Transaction not found".
    if (res.status === 404 || !data) {
      return {
        verdict: 'UNKNOWN',
        amountMinorOrMajor: 0,
        amountUnit: 'major',
        currency: '',
        audit: { httpStatus: res.status, message: body?.message ?? null },
      };
    }
    if (!res.ok) {
      throw new Error(`Chapa verify failed (${res.status}): ${body?.message ?? 'unknown error'}`);
    }
    const status = String(data.status ?? '').toLowerCase();
    const verdict = status === 'success' ? 'PAID' : status === 'pending' ? 'PENDING' : 'FAILED';
    return {
      verdict,
      amountMinorOrMajor: Number(data.amount ?? 0),
      amountUnit: 'major',
      currency: String(data.currency ?? ''),
      mode: data.mode ? String(data.mode) : undefined,
      providerReference: data.reference ? String(data.reference) : undefined,
      providerMethod: data.method ? String(data.method) : undefined,
      audit: { status: data.status, tx_ref: data.tx_ref, mode: data.mode, method: data.method },
    };
  }

  async parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookParseResult | null> {
    this.requireConfigured();
    const provided = header(headers, 'x-chapa-signature') || header(headers, 'chapa-signature');
    if (!provided) return null;

    // Docs sign HMAC-SHA256 of the JSON payload with the secret key. Accept
    // the raw bytes; fall back to the compact re-serialization their example
    // uses, in case of transport re-formatting. Either is keyed — no weakening.
    const candidates = [rawBody.toString('utf8')];
    try {
      candidates.push(JSON.stringify(JSON.parse(candidates[0] as string)));
    } catch {
      return null;
    }
    let authentic = false;
    for (const candidate of candidates) {
      const expected = crypto
        .createHmac('sha256', this.config.secretKey)
        .update(candidate, 'utf8')
        .digest('hex');
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(provided, 'utf8');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        authentic = true;
        break;
      }
    }
    if (!authentic) return null;

    const event = JSON.parse(candidates[0] as string) as {
      event?: unknown;
      tx_ref?: unknown;
      reference?: unknown;
      amount?: unknown;
      currency?: unknown;
      status?: unknown;
      mode?: unknown;
      payment_method?: unknown;
      failure_reason?: unknown;
    };
    const transactionId = typeof event.tx_ref === 'string' ? event.tx_ref : '';
    if (!transactionId) return null;
    const eventName = typeof event.event === 'string' ? event.event : 'unknown';
    const status = String(event.status ?? '').toLowerCase();
    const verdict =
      status === 'success' ? 'PAID' : status === 'pending' ? 'PENDING' : 'FAILED';

    return {
      // Chapa sends no separate event id → tx_ref + event name is the unit.
      eventId: `${transactionId}:${eventName}:${String(event.reference ?? '')}`,
      transactionId,
      evidence: {
        verdict,
        amountMinorOrMajor: Number(event.amount ?? 0),
        amountUnit: 'major',
        currency: String(event.currency ?? ''),
        mode: typeof event.mode === 'string' ? event.mode : undefined,
        providerReference: typeof event.reference === 'string' ? event.reference : undefined,
        providerMethod: typeof event.payment_method === 'string' ? event.payment_method : undefined,
        failureReason: typeof event.failure_reason === 'string' ? event.failure_reason : undefined,
        audit: { event: eventName, status: event.status, mode: event.mode },
      },
    };
  }
}
