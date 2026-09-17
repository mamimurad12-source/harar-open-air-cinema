/** Public event catalog — published events only. */
import { Router } from 'express';
import type { Db } from '../db/connection';
import type { EventRow } from '../db/types';
import { asyncHandler, notFound } from '../lib/errors';
import { toEventDto } from '../services/dto';
import { expireStaleBookings } from '../services/expiry';

export const publicEvents = Router();

publicEvents.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Db;
    expireStaleBookings(db);
    const rows = db
      .prepare(`SELECT * FROM events WHERE status = 'PUBLISHED' ORDER BY created_at DESC`)
      .all() as EventRow[];
    res.json({ events: rows.map(toEventDto) });
  }),
);

publicEvents.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Db;
    expireStaleBookings(db);
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as
      | EventRow
      | undefined;
    if (!row || row.status !== 'PUBLISHED') {
      throw notFound('EVENT_NOT_FOUND', 'Event not found.');
    }
    res.json({ event: toEventDto(row) });
  }),
);
