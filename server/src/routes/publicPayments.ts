/**
 * Public payment surface: method availability, provider callbacks (redirect
 * only — NEVER mutate state), and signed webhooks (verify + idempotent).
 */
import { Router } from 'express';
import type { Db } from '../db/connection';
import { config } from '../config';
import { ApiError, asyncHandler, badRequest } from '../lib/errors';
import { param } from '../lib/http';
import { getProvider, listPaymentMethods } from '../services/payments/registry';
import { handleProviderWebhook } from '../services/payments/service';

export const publicPayments = Router();

publicPayments.get(
  '/methods',
  asyncHandler(async (_req, res) => {
    res.json({ methods: listPaymentMethods() });
  }),
);

/**
 * Provider customer-callback (e.g. Chapa GETs ?trx_ref&ref_id&status here).
 * Redirects the customer to the return page. Performs NO state changes —
 * payment completes only through server-side verification.
 */
publicPayments.get(
  '/callback/:provider',
  asyncHandler(async (req, res) => {
    const provider = getProvider(param(req.params.provider));
    if (!provider) throw badRequest('VALIDATION_ERROR', 'Unknown payment provider.');
    const tx = typeof req.query.trx_ref === 'string' ? req.query.trx_ref : '';
    const refId = typeof req.query.ref_id === 'string' ? req.query.ref_id : '';
    const url = new URL(`${config.publicBaseUrl}/pay/return`);
    url.searchParams.set('provider', provider.id);
    if (tx) url.searchParams.set('tx', tx);
    if (refId) url.searchParams.set('ref', refId);
    res.redirect(302, url.toString());
  }),
);

/**
 * Signed provider webhooks. Raw body (Buffer) is required for HMAC checks —
 * see app.ts, which mounts express.raw() for this path before express.json().
 */
publicPayments.post(
  '/webhook/:provider',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Db;
    const provider = getProvider(param(req.params.provider));
    if (!provider) throw badRequest('VALIDATION_ERROR', 'Unknown payment provider.');
    if (!provider.isConfigured()) {
      throw new ApiError(503, 'PROVIDER_ERROR', 'Payment provider is not configured.');
    }
    if (!Buffer.isBuffer(req.body)) {
      throw badRequest('VALIDATION_ERROR', 'Invalid webhook payload.');
    }
    const parsed = await provider.parseWebhook(req.body, req.headers);
    if (!parsed) {
      throw new ApiError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
    }
    const result = await handleProviderWebhook(
      db,
      provider,
      parsed.eventId,
      parsed.transactionId,
      req.body.toString('utf8'),
    );
    res.status(200).json({ received: true, ...result });
  }),
);
