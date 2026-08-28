import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import { execute, query, queryOne, transaction } from '../db/index.ts';
import { asyncHandler, authenticate } from '../auth/middleware.ts';
import { requireAuth } from '../auth/context.ts';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../auth/password.ts';
import {
  REFRESH_COOKIE,
  hashOpaqueToken,
  issueRefreshToken,
  refreshCookieOptions,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../auth/tokens.ts';
import { badRequest, conflict, unauthorised, unprocessable } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { recordAudit } from '../lib/audit.ts';
import { rateLimit } from '../lib/rateLimit.ts';
import { emailSchema, normaliseEmail, parseBody } from '../lib/validate.ts';
import { createVillaWorkspace, joinDefaultChannels } from '../services/villas.ts';
import { refreshVillaAccess } from '../realtime/hub.ts';

export const authRouter = Router();

const AVATAR_COLOURS = ['#0f766e', '#1d4ed8', '#7c3aed', '#b91c1c', '#c2410c', '#0369a1', '#15803d'];

function pickAvatarColour(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length] as string;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `login:${req.ip}:${normaliseEmail(String((req.body as { email?: string })?.email ?? ''))}`,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  key: (req) => `register:${req.ip}`,
});

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z.string().trim().max(40).optional(),
  /** Creating an owner account and its first workspace in one step. */
  villaName: z.string().trim().min(2).max(120).optional(),
  /** Joining an existing workspace via an emailed invitation. */
  invitationToken: z.string().trim().min(10).max(200).optional(),
});

type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_colour: string;
  locale: string;
};

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    avatarColour: user.avatar_colour,
    locale: user.locale,
  };
}

function villasForUser(userId: string) {
  return query<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    role_name: string;
    role_key: string;
    is_owner: number;
    membership_id: string;
  }>(
    `SELECT v.id, v.name, v.slug, v.timezone, v.currency,
            r.name AS role_name, r.key AS role_key, r.is_owner, m.id AS membership_id
       FROM memberships m
       JOIN villas v ON v.id = m.villa_id
       JOIN roles  r ON r.id = m.role_id
      WHERE m.user_id = ? AND m.status = 'active' AND v.archived_at IS NULL
      ORDER BY r.is_owner DESC, v.name`,
    [userId],
  ).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    currency: row.currency,
    membershipId: row.membership_id,
    role: { key: row.role_key, name: row.role_name, isOwner: row.is_owner === 1 },
  }));
}

type InvitationRecord = {
  id: string;
  villa_id: string;
  email_normalised: string;
  role_id: string;
  job_title: string | null;
  status: string;
  expires_at: string;
};

function loadInvitation(token: string): InvitationRecord {
  const invitation = queryOne<InvitationRecord>(
    `SELECT id, villa_id, email_normalised, role_id, job_title, status, expires_at
       FROM invitations WHERE token_hash = ?`,
    [hashOpaqueToken(token)],
  );
  if (!invitation) throw badRequest('This invitation link is not valid');
  if (invitation.status === 'accepted') throw conflict('This invitation has already been used');
  if (invitation.status === 'revoked') throw badRequest('This invitation has been revoked');
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    execute("UPDATE invitations SET status = 'expired' WHERE id = ?", [invitation.id]);
    throw badRequest('This invitation has expired. Ask the villa owner to send a new one.');
  }
  return invitation;
}

/** Creates the membership described by an invitation and marks it accepted. */
function acceptInvitation(invitation: InvitationRecord, userId: string): string {
  const existing = queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM memberships WHERE villa_id = ? AND user_id = ?',
    [invitation.villa_id, userId],
  );
  const now = new Date().toISOString();

  let membershipId: string;
  if (existing) {
    // Re-inviting someone who was removed reactivates them under the new role
    // rather than failing on the unique constraint.
    membershipId = existing.id;
    execute(
      `UPDATE memberships
          SET role_id = ?, status = 'active', ended_on = NULL, job_title = COALESCE(?, job_title), updated_at = ?
        WHERE id = ?`,
      [invitation.role_id, invitation.job_title, now, membershipId],
    );
  } else {
    membershipId = newId();
    execute(
      `INSERT INTO memberships (id, villa_id, user_id, role_id, job_title, started_on, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [membershipId, invitation.villa_id, userId, invitation.role_id, invitation.job_title, now.slice(0, 10), now, now],
    );
  }

  execute("UPDATE invitations SET status = 'accepted', accepted_by = ?, accepted_at = ? WHERE id = ?", [
    userId,
    now,
    invitation.id,
  ]);
  joinDefaultChannels(invitation.villa_id, membershipId);
  return membershipId;
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
authRouter.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req);
    const problem = checkPasswordStrength(input.password);
    if (problem) throw unprocessable(problem, { password: problem });

    const emailNormalised = normaliseEmail(input.email);
    if (queryOne('SELECT id FROM users WHERE email_normalised = ?', [emailNormalised])) {
      throw conflict('An account with that email already exists. Try signing in instead.');
    }

    // Validate the invitation before writing anything, so a bad token does not
    // leave an orphaned account behind.
    const invitation = input.invitationToken ? loadInvitation(input.invitationToken) : null;
    if (invitation && invitation.email_normalised !== emailNormalised) {
      throw badRequest('This invitation was sent to a different email address');
    }

    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();
    const userId = newId();

    const result = transaction(() => {
      execute(
        `INSERT INTO users (id, email, email_normalised, password_hash, full_name, phone, avatar_colour, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, input.email.trim(), emailNormalised, passwordHash, input.fullName.trim(), input.phone ?? null, pickAvatarColour(emailNormalised), now, now],
      );
      if (invitation) acceptInvitation(invitation, userId);
      if (input.villaName) createVillaWorkspace({ name: input.villaName, ownerUserId: userId });
      return queryOne<UserRecord>(
        'SELECT id, email, full_name, phone, avatar_colour, locale FROM users WHERE id = ?',
        [userId],
      );
    });
    if (!result) throw new Error('User creation failed unexpectedly');

    recordAudit({
      villaId: invitation?.villa_id ?? null,
      actorId: userId,
      action: 'user.registered',
      entityType: 'user',
      entityId: userId,
      summary: `${input.fullName.trim()} created an account`,
      ip: req.ip ?? null,
    });
    refreshVillaAccess(userId);

    const refresh = issueRefreshToken(userId, { userAgent: req.get('user-agent'), ip: req.ip });
    res.cookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions());
    res.status(201).json({
      user: publicUser(result),
      villas: villasForUser(userId),
      accessToken: signAccessToken(userId, refresh.familyId),
      expiresIn: config.accessTokenTtlMinutes * 60,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(z.object({ email: emailSchema, password: z.string().min(1) }), req);
    const emailNormalised = normaliseEmail(input.email);
    const record = queryOne<UserRecord & { password_hash: string; is_active: number }>(
      `SELECT id, email, full_name, phone, avatar_colour, locale, password_hash, is_active
         FROM users WHERE email_normalised = ?`,
      [emailNormalised],
    );

    // Hash against a dummy value when the account is unknown so the response
    // time does not reveal whether the email is registered.
    const valid = record
      ? await verifyPassword(input.password, record.password_hash)
      : await verifyPassword(input.password, await hashPassword('placeholder-for-timing'));

    if (!record || !valid) throw unauthorised('Email or password is incorrect');
    if (record.is_active !== 1) throw unauthorised('This account has been deactivated');

    execute('UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), record.id]);
    const refresh = issueRefreshToken(record.id, { userAgent: req.get('user-agent'), ip: req.ip });
    res.cookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions());
    res.json({
      user: publicUser(record),
      villas: villasForUser(record.id),
      accessToken: signAccessToken(record.id, refresh.familyId),
      expiresIn: config.accessTokenTtlMinutes * 60,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const presented =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ??
      (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (!presented) throw unauthorised('Please sign in again');

    const { userId, issued } = rotateRefreshToken(presented, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    const user = queryOne<UserRecord & { is_active: number }>(
      'SELECT id, email, full_name, phone, avatar_colour, locale, is_active FROM users WHERE id = ?',
      [userId],
    );
    if (!user || user.is_active !== 1) throw unauthorised('Please sign in again');

    res.cookie(REFRESH_COOKIE, issued.token, refreshCookieOptions());
    res.json({
      user: publicUser(user),
      villas: villasForUser(userId),
      accessToken: signAccessToken(userId, issued.familyId),
      expiresIn: config.accessTokenTtlMinutes * 60,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (presented) revokeRefreshToken(presented);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined as unknown as number });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const user = queryOne<UserRecord>(
      'SELECT id, email, full_name, phone, avatar_colour, locale FROM users WHERE id = ?',
      [auth.userId],
    );
    if (!user) throw unauthorised();
    res.json({ user: publicUser(user), villas: villasForUser(auth.userId) });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/auth/me
// ---------------------------------------------------------------------------
authRouter.patch(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const input = parseBody(
      z.object({
        fullName: z.string().trim().min(2).max(120).optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        locale: z.enum(['en', 'id']).optional(),
      }),
      req,
    );
    const updates: string[] = [];
    const params: (string | null)[] = [];
    if (input.fullName !== undefined) { updates.push('full_name = ?'); params.push(input.fullName); }
    if (input.phone !== undefined) { updates.push('phone = ?'); params.push(input.phone); }
    if (input.locale !== undefined) { updates.push('locale = ?'); params.push(input.locale); }
    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...params, auth.userId]);
    }
    const user = queryOne<UserRecord>(
      'SELECT id, email, full_name, phone, avatar_colour, locale FROM users WHERE id = ?',
      [auth.userId],
    );
    res.json({ user: publicUser(user as UserRecord) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
authRouter.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const input = parseBody(
      z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) }),
      req,
    );
    const problem = checkPasswordStrength(input.newPassword);
    if (problem) throw unprocessable(problem, { newPassword: problem });

    const record = queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [
      auth.userId,
    ]);
    if (!record || !(await verifyPassword(input.currentPassword, record.password_hash))) {
      throw unauthorised('Your current password is incorrect');
    }
    execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      await hashPassword(input.newPassword),
      new Date().toISOString(),
      auth.userId,
    ]);
    // Every other device is signed out; the caller gets a fresh token below.
    revokeAllForUser(auth.userId);
    recordAudit({
      villaId: null,
      actorId: auth.userId,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: auth.userId,
      ip: req.ip ?? null,
    });

    const refresh = issueRefreshToken(auth.userId, { userAgent: req.get('user-agent'), ip: req.ip });
    res.cookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions());
    res.json({
      accessToken: signAccessToken(auth.userId, refresh.familyId),
      expiresIn: config.accessTokenTtlMinutes * 60,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/auth/invitations/:token  — public preview of an invitation
// ---------------------------------------------------------------------------
authRouter.get(
  '/invitations/:token',
  asyncHandler(async (req, res) => {
    const invitation = loadInvitation(String(req.params.token));
    const details = queryOne<{ villa_name: string; role_name: string; inviter: string; email: string }>(
      `SELECT v.name AS villa_name, r.name AS role_name, u.full_name AS inviter, i.email AS email
         FROM invitations i
         JOIN villas v ON v.id = i.villa_id
         JOIN roles  r ON r.id = i.role_id
         JOIN users  u ON u.id = i.invited_by
        WHERE i.id = ?`,
      [invitation.id],
    );
    const account = queryOne<{ id: string }>('SELECT id FROM users WHERE email_normalised = ?', [
      invitation.email_normalised,
    ]);
    res.json({
      villaName: details?.villa_name ?? '',
      roleName: details?.role_name ?? '',
      invitedBy: details?.inviter ?? '',
      email: details?.email ?? '',
      jobTitle: invitation.job_title,
      expiresAt: invitation.expires_at,
      /** Tells the client whether to show sign-in or sign-up on the accept page. */
      hasAccount: Boolean(account),
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/invitations/:token/accept  — accept while already signed in
// ---------------------------------------------------------------------------
authRouter.post(
  '/invitations/:token/accept',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const invitation = loadInvitation(String(req.params.token));
    const user = queryOne<{ email_normalised: string }>(
      'SELECT email_normalised FROM users WHERE id = ?',
      [auth.userId],
    );
    if (!user || user.email_normalised !== invitation.email_normalised) {
      throw badRequest('This invitation was sent to a different email address');
    }
    const membershipId = transaction(() => acceptInvitation(invitation, auth.userId));
    recordAudit({
      villaId: invitation.villa_id,
      actorId: auth.userId,
      action: 'membership.joined',
      entityType: 'membership',
      entityId: membershipId,
      summary: `${auth.fullName} joined the villa`,
      ip: req.ip ?? null,
    });
    refreshVillaAccess(auth.userId);
    res.status(201).json({ villaId: invitation.villa_id, membershipId, villas: villasForUser(auth.userId) });
  }),
);
