/**
 * TEST-ONLY payment provider. It exercises OUR pipeline (initiation, verify
 * pulls, webhooks, completion, idempotency) without touching any real money
 * rail or pretending a provider responded. Never registered outside tests.
 */
import crypto from 'node:crypto';
import type { PaymentMethod } from '../src/db/types';
import type {
  InitiateContext,
  InitiateResult,
  PaymentProvider,
  VerificationEvidence,
  WebhookParseResult,
} from '../src/services/payments/types';

export type StubVerdict = 'PAID' | 'PENDING' | 'FAILED' | 'UNKNOWN';

export class StubProvider implements PaymentProvider {
  readonly id = 'stub';
  readonly displayName = 'Stub (tests only)';
  readonly supportedMethods: readonly PaymentMethod[] = [
    'EBIRR',
    'COOPAY',
    'CBE',
    'TELEBIRR',
    'MOBILE_BANKING',
  ];

  /** Programmable verdicts per transaction id (default: PAID). */
  verdicts = new Map<string, StubVerdict>();
  /** Amount override per transaction (for mismatch tests). */
  amounts = new Map<string, number>();
  /** Currency override per transaction. */
  currencies = new Map<string, string>();
  /** Webhook HMAC secret (test-only scheme). */
  webhookSecret = 'stub-webhook-secret';
  initiations: InitiateContext[] = [];

  constructor(private readonly configured = true) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async createPayment(ctx: InitiateContext): Promise<InitiateResult> {
    if (!this.configured) throw new Error('Stub provider not configured.');
    this.initiations.push(ctx);
    return {
      checkoutUrl: `https://stub-pay.test/checkout/${ctx.transactionId}`,
      providerReference: `stub-ref-${ctx.transactionId}`,
      audit: { stub: true },
    };
  }

  async verifyPayment(transactionId: string): Promise<VerificationEvidence> {
    const last = this.initiations.find((i) => i.transactionId === transactionId);
    return {
      verdict: this.verdicts.get(transactionId) ?? 'PAID',
      amountMinorOrMajor: this.amounts.get(transactionId) ?? last?.amountBirr ?? 0,
      amountUnit: 'major',
      currency: this.currencies.get(transactionId) ?? 'ETB',
      providerReference: `stub-ref-${transactionId}`,
      providerMethod: 'stub-wallet',
      audit: { stub: true },
    };
  }

  signWebhook(rawBody: Buffer): string {
    return crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  async parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookParseResult | null> {
    const header = headers['x-stub-signature'];
    const provided = Array.isArray(header) ? (header[0] ?? '') : (header ?? '');
    const expected = this.signWebhook(rawBody);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    let parsed: { transactionId?: unknown };
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as { transactionId?: unknown };
    } catch {
      return null;
    }
    const transactionId = typeof parsed.transactionId === 'string' ? parsed.transactionId : '';
    if (!transactionId) return null;
    return {
      eventId: `stub-event-${transactionId}`,
      transactionId,
      evidence: await this.verifyPayment(transactionId),
    };
  }
}
