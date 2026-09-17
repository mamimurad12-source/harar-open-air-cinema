/** Organizer payment ledger (attempts with provider references; never secrets). */
import { Router } from 'express';
import type { Db } from '../db/connection';
import { asyncHandler } from '../lib/errors';
import { requireAdmin } from '../middleware/requireAdmin';
import { listPayments } from '../services/payments/service';

export const adminPayments = Router();
adminPayments.use(requireAdmin);

adminPayments.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Db;
    const limitRaw = Number(req.query.limit ?? 50);
    const offsetRaw = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isInteger(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    res.json(listPayments(db, { limit, offset }));
  }),
);
