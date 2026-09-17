/**
 * Central configuration. Everything secret comes from environment variables —
 * see `.env.example`. Never commit real secrets.
 */
import dotenv from 'dotenv';
import { PAYMENT_METHODS } from './services/payments/types';
import type { PaymentMethod } from './db/types';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (isProd) {
    throw new Error('JWT_SECRET must be set to a long random value in production.');
  }
  if (!isTest) {
    console.warn(
      '[config] JWT_SECRET not set — using an insecure dev-only fallback. Set JWT_SECRET in .env.',
    );
  }
  return 'dev-only-jwt-secret-do-not-use-in-production';
}

/**
 * Methods the OPERATOR has confirmed as live on the merchant's actual
 * checkout. Chapa exposes rails per merchant account and offers no API to
 * query them, so nothing may be advertised until a human confirms it.
 * Unset/empty = nothing confirmed = nothing advertised (fail closed).
 * Fails fast on unknown codes so typos can never silently narrow payments.
 */
function resolvePaymentMethods(): PaymentMethod[] | null {
  const raw = process.env.PAYMENT_METHODS;
  if (!raw || raw.trim() === '') return null;
  const codes = raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);
  const unknown = codes.filter((c) => !(PAYMENT_METHODS as readonly string[]).includes(c));
  if (unknown.length > 0) {
    throw new Error(
      `PAYMENT_METHODS contains unknown codes: ${unknown.join(', ')}. Known codes: ${PAYMENT_METHODS.join(', ')}.`,
    );
  }
  return [...new Set(codes)] as PaymentMethod[];
}

export const config = {
  nodeEnv,
  isProd,
  isTest,
  port: Number(process.env.PORT ?? 3001),
  /** PostgreSQL connection string (local docker-compose default; Neon URL in TEST/prod). */
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://harar:harar@localhost:5432/harar_cinema',
  jwtSecret: resolveJwtSecret(),
  sessionCookieName: 'hoc_admin_session',
  /** Admin session lifetime. */
  sessionMaxAgeSec: 12 * 60 * 60,
  bcryptRounds: 10,
  seedAdminEmail: process.env.ADMIN_EMAIL ?? 'admin@harar-cinema.local',
  seedAdminPassword: process.env.ADMIN_PASSWORD ?? 'change-me-dev-admin',
  seedAdminName: process.env.ADMIN_NAME ?? 'Harar Cinema Admin',
  /** Minutes a PENDING booking stays payable before expiring + releasing seats. */
  paymentWindowMinutes: Number(process.env.PAYMENT_WINDOW_MINUTES ?? 30),
  /** Public site origin (payment return page). */
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    'http://localhost:5173'
  ).replace(/\/+$/, ''),
  /** Public API origin (provider callback URL). Must be HTTPS + reachable in prod. */
  publicApiUrl: (
    process.env.PUBLIC_API_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    'http://localhost:3001'
  ).replace(/\/+$/, ''),
  /** Operator-confirmed methods (null = none confirmed → advertise nothing). */
  paymentMethods: resolvePaymentMethods(),
  chapa: {
    /** Empty = Chapa not configured → all methods show "Coming soon". */
    secretKey: process.env.CHAPA_SECRET_KEY ?? '',
    mode: (process.env.CHAPA_MODE ?? 'test') as 'test' | 'live',
    baseUrl: (process.env.CHAPA_BASE_URL ?? 'https://api.chapa.co/v1').replace(/\/+$/, ''),
  },
};
