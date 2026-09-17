/**
 * Provider-independent payment abstraction. The booking system only speaks to
 * `PaymentService`; each rail (aggregator or direct wallet/bank API) plugs in
 * as a `PaymentProvider`. Adding a method later = new adapter, zero booking
 * changes. Only adapters backed by real provider documentation may exist.
 */
import type { PaymentMethod } from '../../db/types';

/** Customer-facing preference. Validated strictly — never free text. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'EBIRR',
  'COOPAY',
  'CBE',
  'TELEBIRR',
  'MOBILE_BANKING',
] as const;

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    typeof value === 'string' &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

/** Method metadata for the selection UI (availability = provider configured + operator confirmed). */
export interface PaymentMethodInfo {
  method: PaymentMethod;
  label: string;
  provider: string | null;
  available: boolean;
}

export interface InitiateContext {
  /** Our unique transaction reference for this attempt (tx_ref). */
  transactionId: string;
  amountBirr: number;
  currency: 'ETB';
  customerName: string;
  /** Normalized +251… phone (adapter formats per provider rules). */
  customerPhone: string;
  bookingReference: string;
  eventTitle: string;
  callbackUrl: string;
  returnUrl: string;
}

export interface InitiateResult {
  /** Where to send the customer (hosted checkout). Absent for push flows. */
  checkoutUrl?: string;
  /** Human reference for receipts/support. */
  providerReference?: string;
  /** JSON-serializable audit trail (must not contain secrets). */
  audit: unknown;
}

export type ProviderVerdict = 'PAID' | 'PENDING' | 'FAILED' | 'UNKNOWN';

/** Authoritative server-side answer from the provider (verify API / webhook). */
export interface VerificationEvidence {
  verdict: ProviderVerdict;
  amountMinorOrMajor: number;
  /** 'major' = birr as Chapa reports; adapters normalize for comparison. */
  amountUnit: 'major' | 'minor';
  currency: string;
  mode?: string;
  providerReference?: string;
  providerMethod?: string;
  failureReason?: string;
  audit: unknown;
}

export interface WebhookParseResult {
  /** Stable provider event id for idempotency (falls back to tx_ref+event). */
  eventId: string;
  transactionId: string;
  evidence: VerificationEvidence;
}

export interface PaymentProvider {
  /** Stable id, e.g. 'chapa'. Used in URLs and the DB. */
  readonly id: string;
  readonly displayName: string;
  /** Requested methods this provider actually serves. */
  readonly supportedMethods: readonly PaymentMethod[];
  /** False until real merchant credentials are configured. */
  isConfigured(): boolean;
  /** Start a payment attempt at the provider. */
  createPayment(ctx: InitiateContext): Promise<InitiateResult>;
  /** Server-to-server status pull. The trust anchor for completion. */
  verifyPayment(transactionId: string): Promise<VerificationEvidence>;
  /**
   * Parse + authenticate an inbound webhook. Returns null when the signature
   * is missing/invalid (caller must reject without state changes).
   */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookParseResult | null>;
  /**
   * Expected provider-side mode (e.g. Chapa test/live). Verification evidence
   * carrying a different mode fails closed. Null = provider has no modes.
   */
  expectedMode?(): string | null;
  /** Refunds are intentionally absent unless a provider documents them. */
}
