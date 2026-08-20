import type { NextFunction, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || 'development-only-change-me');

export async function issueSession() {
  return new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').setJti(randomBytes(16).toString('hex')).sign(secret());
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.mustaner_session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    await jwtVerify(token, secret());
    next();
  } catch { res.status(401).json({ error: 'Session expired' }); }
}

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/auth/login') return next();
  const cookie = req.cookies?.mustaner_csrf;
  const header = req.header('x-csrf-token');
  if (!cookie || !header || cookie !== header) return res.status(403).json({ error: 'Invalid CSRF token' });
  next();
}

export const newCsrfToken = () => randomBytes(24).toString('base64url');
