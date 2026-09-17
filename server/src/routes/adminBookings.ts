/** Organizer booking read models (list + detail with tickets). */
import { Router } from 'express';
import type { RootDb } from '../db/connection';
import { asyncHandler } from '../lib/errors';
import { param } from '../lib/http';
import { requireAdmin } from '../middleware/requireAdmin';
import { getBookingDetail, listBookings } from '../services/adminService';

export const adminBookings = Router();
adminBookings.use(requireAdmin);

adminBookings.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const limitRaw = Number(req.query.limit ?? 50);
    const offsetRaw = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isInteger(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    res.json(await listBookings(db, { eventId, limit, offset }));
  }),
);

adminBookings.get(
  '/:reference',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    res.json({ booking: await getBookingDetail(db, param(req.params.reference)) });
  }),
);
