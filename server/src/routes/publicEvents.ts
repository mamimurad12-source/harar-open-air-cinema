/** Public event catalog — published events only. */
import { Router } from 'express';
import type { RootDb } from '../db/connection';
import type { EventRow } from '../db/types';
import { asyncHandler, notFound } from '../lib/errors';
import { toEventDto } from '../services/dto';
import { expireStaleBookings } from '../services/expiry';

export const publicEvents = Router();

publicEvents.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    await expireStaleBookings(db);
    const rows = await db.all<EventRow>(
      `SELECT * FROM events WHERE status = 'PUBLISHED' ORDER BY created_at DESC`,
    );
    res.json({ events: rows.map(toEventDto) });
  }),
);

publicEvents.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    await expireStaleBookings(db);
    const row = await db.get<EventRow>('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!row || row.status !== 'PUBLISHED') {
      throw notFound('EVENT_NOT_FOUND', 'Event not found.');
    }
    res.json({ event: toEventDto(row) });
  }),
);
