import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { execute, queryOne } from '../db/index.ts';
import { newId, newToken } from '../lib/ids.ts';
import { unauthorised } from '../lib/errors.ts';

export type AccessTokenClaims = { sub: string; sid: string };

export function signAccessToken(userId: string, sessionFamily: string): string {
  return jwt.sign({ sub: userId, sid: sessionFamily }, config.accessSecret, {
    expiresIn: `${config.accessTokenTtlMinutes}m`,
    issuer: 'villa-staff-manager',
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, config.accessSecret, { issuer: 'villa-staff-manager' });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('bad payload');
    return { sub: payload.sub, sid: String((payload as Record<string, unknown>).sid ?? '') };
  } catch {
    throw unauthorised('Your session has expired, please sign in again');
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type IssuedRefreshToken = { token: string; familyId: string; expiresAt: string };

export function issueRefreshToken(
  userId: string,
  context: { userAgent?: string | null; ip?: string | null; familyId?: string } = {},
): IssuedRefreshToken {
  const token = newToken(48);
  const familyId = context.familyId ?? newId();
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000).toISOString();
  execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, user_agent, ip, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), userId, hashToken(token), familyId, context.userAgent ?? null, context.ip ?? null, expiresAt, new Date().toISOString()],
  );
  return { token, familyId, expiresAt };
}

type StoredRefreshToken = {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
};

/**
 * How long after rotation an already-used token is still accepted.
 *
 * Two tabs refreshing at once, or a client retrying a request that timed out
 * in flight, both legitimately present the same token twice within a moment of
 * each other. Outside this window a reused token is treated as a replay.
 */
const ROTATION_GRACE_MS = 30_000;

/**
 * Rotates a refresh token. Presenting an already-revoked token means the token
 * leaked and was replayed, so the whole family is revoked and the user has to
 * sign in again — the standard reuse-detection response.
 */
export function rotateRefreshToken(
  presented: string,
  context: { userAgent?: string | null; ip?: string | null } = {},
): { userId: string; issued: IssuedRefreshToken } {
  const stored = queryOne<StoredRefreshToken>(
    'SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by FROM refresh_tokens WHERE token_hash = ?',
    [hashToken(presented)],
  );
  if (!stored) throw unauthorised('Please sign in again');

  if (stored.revoked_at) {
    const rotatedAgo = Date.now() - new Date(stored.revoked_at).getTime();
    if (rotatedAgo <= ROTATION_GRACE_MS && stored.replaced_by) {
      // A concurrent rotation, not a replay: hand out another token in the same
      // family rather than destroying the session both callers are using.
      return {
        userId: stored.user_id,
        issued: issueRefreshToken(stored.user_id, { ...context, familyId: stored.family_id }),
      };
    }
    // A token reused long after rotation means it leaked; every token in the
    // family goes, so the attacker and the victim both have to sign in again.
    execute('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL', [
      new Date().toISOString(),
      stored.family_id,
    ]);
    throw unauthorised('Session reuse detected, please sign in again');
  }
  if (new Date(stored.expires_at).getTime() < Date.now()) {
    throw unauthorised('Your session has expired, please sign in again');
  }

  const issued = issueRefreshToken(stored.user_id, { ...context, familyId: stored.family_id });
  execute('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?', [
    new Date().toISOString(),
    hashToken(issued.token),
    stored.id,
  ]);
  return { userId: stored.user_id, issued };
}

export function revokeRefreshToken(presented: string): void {
  execute('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [
    new Date().toISOString(),
    hashToken(presented),
  ]);
}

export function revokeAllForUser(userId: string): void {
  execute('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [
    new Date().toISOString(),
    userId,
  ]);
}

export function hashOpaqueToken(token: string): string {
  return hashToken(token);
}

export const REFRESH_COOKIE = 'villa_refresh';

export function refreshCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: config.refreshTokenTtlDays * 86_400_000,
  };
}
