/** Protects /api/admin/* — real auth, enforced server-side on every request. */
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { unauthorized } from '../lib/errors';
import type { SessionPayload } from '../lib/auth';
import { verifySession } from '../lib/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: SessionPayload;
    }
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token: string | undefined = req.cookies?.[config.sessionCookieName];
  if (!token) {
    next(unauthorized());
    return;
  }
  const session = verifySession(token);
  if (!session) {
    next(unauthorized('Session expired. Please log in again.'));
    return;
  }
  req.admin = session;
  next();
}
