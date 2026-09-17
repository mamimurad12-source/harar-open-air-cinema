/** Organizer event management (all statuses, create/edit/publish). */
import { Router } from 'express';
import type { Db } from '../db/connection';
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
    const db = req.app.locals.db as Db;
    res.json({ events: listEvents(db) });
  }),
);

adminEvents.post(
  '/',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Db;
    const event = createEvent(db, req.body ?? {});
    res.status(201).json({ event });
  }),
);

adminEvents.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Db;
    expireStaleBookings(db);
    res.json({ event: getEventAdmin(db, param(req.params.id)) });
  }),
);

adminEvents.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Db;
    res.json({ event: updateEvent(db, param(req.params.id), req.body ?? {}) });
  }),
);
