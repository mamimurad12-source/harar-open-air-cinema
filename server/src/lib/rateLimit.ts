/** Tiny in-memory rate limiter (per-process; a reverse proxy adds the real shield). */
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors';

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      next(new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.'));
      return;
    }
    next();
  };
}
