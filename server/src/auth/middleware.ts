import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { queryOne } from '../db/index.ts';
import { forbidden, notFound, unauthorised } from '../lib/errors.ts';
import type { PermissionKey } from '../permissions.ts';
import { loadVillaContext } from './context.ts';
import { verifyAccessToken } from './tokens.ts';

type UserRow = { id: string; email: string; full_name: string; is_active: number };

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** Rejects the request unless a valid access token names an active user. */
export const authenticate: RequestHandler = (req, _res, next) => {
  try {
    const token = bearerToken(req);
    if (!token) throw unauthorised();
    const claims = verifyAccessToken(token);
    const user = queryOne<UserRow>('SELECT id, email, full_name, is_active FROM users WHERE id = ?', [
      claims.sub,
    ]);
    if (!user) throw unauthorised();
    if (user.is_active !== 1) throw forbidden('This account has been deactivated');
    req.auth = {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      sessionFamily: claims.sid,
    };
    next();
  } catch (error) {
    next(error);
  }
};

/** Populates `req.auth` when a token is present but never rejects. */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) return next();
  try {
    const claims = verifyAccessToken(token);
    const user = queryOne<UserRow>('SELECT id, email, full_name, is_active FROM users WHERE id = ?', [
      claims.sub,
    ]);
    if (user && user.is_active === 1) {
      req.auth = { userId: user.id, email: user.email, fullName: user.full_name, sessionFamily: claims.sid };
    }
  } catch {
    // An invalid token on an optional route is treated as no token.
  }
  next();
};

/**
 * Resolves the tenant for `:villaId` and attaches the caller's membership and
 * effective permissions. Every tenant-scoped route sits behind this, which is
 * what makes `req.villa.villaId` safe to use as the tenant filter downstream.
 */
export const withVilla: RequestHandler = (req, _res, next) => {
  try {
    if (!req.auth) throw unauthorised();
    const villaId = req.params.villaId;
    if (!villaId) throw notFound('Villa not found');
    const context = loadVillaContext(req.auth.userId, villaId);
    // A villa the caller is not a member of is reported as missing rather than
    // forbidden, so the API does not confirm which villa ids exist.
    if (!context) throw notFound('Villa not found');
    req.villa = context;
    next();
  } catch (error) {
    next(error);
  }
};

export function requirePermission(...permissions: PermissionKey[]): RequestHandler {
  return (req, _res, next) => {
    const villa = req.villa;
    if (!villa) return next(unauthorised('Villa context missing'));
    const held = permissions.some(
      (permission) => villa.permissions.has(permission) || villa.permissions.has('*'),
    );
    if (!held) {
      return next(
        forbidden(
          permissions.length === 1
            ? `This action requires the "${permissions[0]}" permission`
            : `This action requires one of: ${permissions.join(', ')}`,
          { permissions },
        ),
      );
    }
    next();
  };
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
