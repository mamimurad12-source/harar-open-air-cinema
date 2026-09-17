/** Admin authentication primitives: bcrypt passwords + signed JWT sessions. */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { config } from '../config';
import type { AdminRole } from '../db/types';

export interface SessionPayload {
  sub: string;
  email: string;
  role: AdminRole;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.sessionMaxAgeSec });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as SessionPayload;
    if (!decoded?.sub || !decoded?.email) return null;
    return { sub: decoded.sub, email: decoded.email, role: decoded.role ?? 'ADMIN' };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.sessionMaxAgeSec * 1000,
  };
}

export function clearCookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' };
}
