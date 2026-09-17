/** Admin session endpoints (JWT in an httpOnly cookie). */
import { Router } from 'express';
import type { RootDb } from '../db/connection';
import { config } from '../config';
import { clearCookieOptions, sessionCookieOptions, signSession } from '../lib/auth';
import { ApiError, asyncHandler } from '../lib/errors';
import { createRateLimiter } from '../lib/rateLimit';
import { requireAdmin } from '../middleware/requireAdmin';
import { verifyAdminCredentials } from '../services/adminService';

export const adminAuth = Router();

const loginLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 15 });

adminAuth.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await verifyAdminCredentials(db, email, password);
    if (!user) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    const token = signSession({ sub: user.id, email: user.email, role: user.role as 'ADMIN' | 'STAFF' });
    res.cookie(config.sessionCookieName, token, sessionCookieOptions());
    res.json({ user });
  }),
);

adminAuth.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    res.clearCookie(config.sessionCookieName, clearCookieOptions());
    res.json({ ok: true });
  }),
);

adminAuth.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as RootDb;
    const row = await db.get<{ id: string; name: string; email: string; role: string }>(
      'SELECT id, name, email, role FROM admin_users WHERE id = $1',
      [req.admin?.sub],
    );
    if (!row) throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.');
    res.json({ user: row });
  }),
);
