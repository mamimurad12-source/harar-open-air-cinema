/** Provider registry — env-configured in prod, swappable in tests. */
import { config } from '../../config';
import type { PaymentMethod } from '../../db/types';
import { ChapaAdapter } from './chapa';
import type { PaymentMethodInfo, PaymentProvider } from './types';
import { PAYMENT_METHODS } from './types';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  EBIRR: 'eBirr',
  COOPAY: 'Coopay',
  CBE: 'CBE',
  TELEBIRR: 'Telebirr',
  MOBILE_BANKING: 'Mobile Banking',
};

function productionProviders(): PaymentProvider[] {
  return [
    new ChapaAdapter({
      secretKey: config.chapa.secretKey,
      mode: config.chapa.mode,
      baseUrl: config.chapa.baseUrl,
    }),
  ];
}

let override: PaymentProvider[] | null = null;

/** Test hook — never used in production code paths. */
export function __setProvidersForTests(providers: PaymentProvider[] | null): void {
  override = providers;
}

/**
 * Test hook for the operator allowlist. `undefined` = use the real config
 * (null in tests unless PAYMENT_METHODS is set); null/[] = nothing confirmed.
 */
let allowlistOverride: PaymentMethod[] | null | undefined;

export function __setAllowlistForTests(
  allowlist: PaymentMethod[] | null | undefined,
): void {
  allowlistOverride = allowlist;
}

function effectiveAllowlist(): PaymentMethod[] | null {
  return allowlistOverride !== undefined ? allowlistOverride : config.paymentMethods;
}

/** A method is advertised only after the operator confirms it on the merchant checkout. */
function isOperatorConfirmed(method: PaymentMethod): boolean {
  const allowlist = effectiveAllowlist();
  return allowlist !== null && allowlist.includes(method);
}

export function getProviders(): PaymentProvider[] {
  return override ?? productionProviders();
}

export function getProvider(id: string): PaymentProvider | null {
  return getProviders().find((p) => p.id === id) ?? null;
}

/** All five requested methods with live availability flags for the UI. */
export function listPaymentMethods(): PaymentMethodInfo[] {
  const providers = getProviders();
  return PAYMENT_METHODS.map((method) => {
    const serving = providers.filter(
      (p) => p.supportedMethods.includes(method) && p.isConfigured(),
    );
    const first = serving[0];
    const available = serving.length > 0 && isOperatorConfirmed(method);
    return {
      method,
      label: METHOD_LABELS[method],
      provider: available && first ? first.id : null,
      available,
    };
  });
}

/**
 * Resolve a validated customer preference to a configured provider.
 * Returns null for unconfirmed methods, so direct API calls cannot bypass
 * the advertised set either. Callers treat null as "coming soon".
 */
export function providerForMethod(method: PaymentMethod): PaymentProvider | null {
  if (!isOperatorConfirmed(method)) return null;
  return (
    getProviders().find((p) => p.supportedMethods.includes(method) && p.isConfigured()) ?? null
  );
}
