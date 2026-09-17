/**
 * Public booking endpoints. Money math happens server-side; the client is
 * never trusted. Payment routes live here because payment belongs to a booking.
 */
import { Router } from 'express';
import type { RootDb } from '../db/connection';
import { asyncHandler, badRequest } from '../lib/errors';
import { param } from '../lib/http';
import { createRateLimiter } from '../lib/rateLimit';
import { createBooking, getBookingByReference } from '../services/bookingService';
import {
  getPaymentStatus,
  initiatePayment,
  triggerVerifyPayment,
} from '../services/payments/service';

export const publicBookings = Router();

const paymentLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

publicBookings.post(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const header = req.get('Idempotency-Key');
    const { statusCode, body } = await createBooking(db, {
      eventId: req.body?.eventId,
      customerName: req.body?.customerName,
      phone: req.body?.phone,
      quantity: req.body?.quantity,
      idempotencyKey: Array.isArray(header) ? header[0] : header,
    });
    res.status(statusCode).json({ booking: body });
  }),
);

publicBookings.get(
  '/:reference',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const phone = req.query.phone;
    if (typeof phone !== 'string' || !phone.trim()) {
      throw badRequest('VALIDATION_ERROR', 'Phone number is required to view a booking.');
    }
    const booking = await getBookingByReference(db, param(req.params.reference), phone);
    res.json({ booking });
  }),
);

/** Start a payment attempt: validates, prices from DB, returns safe checkout info. */
publicBookings.post(
  '/:reference/payment',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const result = await initiatePayment(db, {
      bookingReference: param(req.params.reference),
      paymentMethod: req.body?.paymentMethod,
    });
    res.status(201).json(result);
  }),
);

/** Read-only payment status (phone must match). Polling this never pays. */
publicBookings.get(
  '/:reference/payment',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const phone = req.query.phone;
    if (typeof phone !== 'string' || !phone.trim()) {
      throw badRequest('VALIDATION_ERROR', 'Phone number is required to view payment status.');
    }
    res.json(await getPaymentStatus(db, param(req.params.reference), phone));
  }),
);

/**
 * "Customer returned from payment" → server asks the PROVIDER for the truth.
 * The only non-webhook path that can complete a payment.
 */
publicBookings.post(
  '/:reference/payment/verify',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const phone =
      (typeof req.body?.phone === 'string' && req.body.phone) ||
      (typeof req.query.phone === 'string' && req.query.phone) ||
      '';
    if (!phone.trim()) {
      throw badRequest('VALIDATION_ERROR', 'Phone number is required to verify payment.');
    }
    res.json(await triggerVerifyPayment(db, param(req.params.reference), phone));
  }),
);
