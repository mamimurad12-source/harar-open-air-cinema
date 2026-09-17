/** Gate-side ticket validation. Always 200 with an explicit outcome (auth aside). */
import { Router } from 'express';
import type { RootDb } from '../db/connection';
import { asyncHandler } from '../lib/errors';
import { requireAdmin } from '../middleware/requireAdmin';
import { validateTicket } from '../services/ticketService';

export const adminTickets = Router();
adminTickets.use(requireAdmin);

adminTickets.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    res.json({ validation: await validateTicket(db, token) });
  }),
);
