/** Organizer event management (all statuses, create/edit/publish). */
import { Router } from 'express';
import type { RootDb } from '../db/connection';
import { asyncHandler } from '../lib/errors';
import { param } from '../lib/http';
import { requireAdmin } from '../middleware/requireAdmin';
import { expireStaleBookings } from '../services/expiry';
import { createEvent, getEventAdmin, listEvents, updateEvent } from '../services/adminService';

export const adminEvents = Router();
adminEvents.use(requireAdmin);

adminEvents.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    res.json({ events: await listEvents(db) });
  }),
);

adminEvents.post(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const event = await createEvent(db, req.body ?? {});
    res.status(201).json({ event });
  }),
);

adminEvents.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    await expireStaleBookings(db);
    res.json({ event: await getEventAdmin(db, param(req.params.id)) });
  }),
);

adminEvents.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    res.json({ event: await updateEvent(db, param(req.params.id), req.body ?? {}) });
  }),
);
