/** Typed API errors → consistent { error: { code, message, details } } JSON. */
import type { NextFunction, Request, Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_QUANTITY'
  | 'INVALID_PHONE'
  | 'NOT_FOUND'
  | 'EVENT_NOT_FOUND'
  | 'EVENT_NOT_AVAILABLE'
  | 'SOLD_OUT'
  | 'INSUFFICIENT_CAPACITY'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_EXPIRED'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_NOT_PAYABLE'
  | 'ALREADY_PAID'
  | 'INVALID_SIGNATURE'
  | 'PROVIDER_ERROR'
  | 'TICKET_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (code: ErrorCode, message: string, details?: unknown) =>
  new ApiError(400, code, message, details);
export const unauthorized = (message = 'Authentication required.') =>
  new ApiError(401, 'UNAUTHORIZED', message);
export const notFound = (code: ErrorCode, message: string) => new ApiError(404, code, message);
export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new ApiError(409, code, message, details);

export type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncRoute) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? null },
    });
    return;
  }
  console.error('[api] Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', details: null },
  });
}
