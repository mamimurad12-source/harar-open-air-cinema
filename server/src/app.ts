/**
 * Express application factory. Tests call `createApp({ databaseUrl })`
 * to get an isolated app + database; production boots via `index.ts`.
 */
import express from 'express';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import type { RootDb } from './db/connection';
import { openDatabase } from './db/connection';
import { runMigrations } from './db/migrate';
import { errorHandler } from './lib/errors';
import { publicEvents } from './routes/publicEvents';
import { publicBookings } from './routes/publicBookings';
import { publicPayments } from './routes/publicPayments';
import { adminAuth } from './routes/adminAuth';
import { adminEvents } from './routes/adminEvents';
import { adminBookings } from './routes/adminBookings';
import { adminTickets } from './routes/adminTickets';
import { adminPayments } from './routes/adminPayments';

export interface AppOptions {
  databaseUrl?: string;
  /** Serve the built Vite frontend (same-origin API + site in production). */
  serveFrontend?: string | false;
}

export async function createApp(options: AppOptions = {}): Promise<{ app: Express; db: RootDb }> {
  const db = await openDatabase(options.databaseUrl ?? config.databaseUrl);
  await runMigrations(db);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Webhook HMACs are computed over raw bytes — capture them BEFORE json().
  // (body-parser skips paths whose body was already parsed.)
  app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '64kb' }));
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.locals.db = db;

  // ---- Public API ----
  app.use('/api/events', publicEvents);
  app.use('/api/bookings', publicBookings);
  app.use('/api/payments', publicPayments);

  // ---- Admin API (every route enforces requireAdmin) ----
  app.use('/api/admin', adminAuth);
  app.use('/api/admin/events', adminEvents);
  app.use('/api/admin/bookings', adminBookings);
  app.use('/api/admin/tickets', adminTickets);
  app.use('/api/admin/payments', adminPayments);

  // ---- Optional same-origin frontend ----
  const distDir = options.serveFrontend;
  if (distDir && fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // ---- API 404 + errors ----
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
  });
  app.use(errorHandler);

  return { app, db };
}
