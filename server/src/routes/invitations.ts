import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import { execute, query, queryOne } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { requireAuth, requireVilla } from '../auth/context.ts';
import { hashOpaqueToken } from '../auth/tokens.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { newId, newToken } from '../lib/ids.ts';
import { rateLimit } from '../lib/rateLimit.ts';
import { emailSchema, normaliseEmail, parseBody } from '../lib/validate.ts';
import { invitationEmail, sendEmail } from '../services/mailer.ts';

export const invitationsRouter = Router({ mergeParams: true });

const inviteLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 60,
  key: (req) => `invite:${req.params.villaId}`,
  message: 'Too many invitations sent in the last hour. Please try again later.',
});

type InvitationRow = {
  id: string;
  email: string;
  status: string;
  job_title: string | null;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  role_id: string;
  role_name: string;
  role_colour: string;
  inviter_name: string;
};

function serialise(row: InvitationRow) {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    jobTitle: row.job_title,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    role: { id: row.role_id, name: row.role_name, colour: row.role_colour },
    invitedBy: row.inviter_name,
  };
}

const INVITATION_SELECT = `
  SELECT i.id, i.email, i.status, i.job_title, i.expires_at, i.created_at, i.accepted_at,
         r.id AS role_id, r.name AS role_name, r.colour AS role_colour,
         u.full_name AS inviter_name
    FROM invitations i
    JOIN roles r ON r.id = i.role_id
    JOIN users u ON u.id = i.invited_by`;

// ---------------------------------------------------------------------------
// GET /invitations
// ---------------------------------------------------------------------------
invitationsRouter.get(
  '/',
  requirePermission('members:invite'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const rows = query<InvitationRow>(
      `${INVITATION_SELECT} WHERE i.villa_id = ? ORDER BY i.created_at DESC LIMIT 200`,
      [villa.villaId],
    );
    res.json({ invitations: rows.map(serialise) });
  }),
);

// ---------------------------------------------------------------------------
// POST /invitations — invite a staff member to register and join
// ---------------------------------------------------------------------------
invitationsRouter.post(
  '/',
  requirePermission('members:invite'),
  inviteLimiter,
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        email: emailSchema,
        roleId: z.string().trim().min(1, 'Choose a role for this person'),
        jobTitle: z.string().trim().max(80).optional(),
      }),
      req,
    );

    const role = queryOne<{ id: string; name: string; is_owner: number }>(
      'SELECT id, name, is_owner FROM roles WHERE villa_id = ? AND id = ?',
      [villa.villaId, input.roleId],
    );
    if (!role) throw badRequest('That role does not exist in this villa');
    if (role.is_owner === 1) throw forbidden('Staff cannot be invited straight into the owner role');

    const emailNormalised = normaliseEmail(input.email);

    // Someone already in the villa does not need an invitation.
    const existingMember = queryOne<{ status: string; full_name: string }>(
      `SELECT m.status, u.full_name
         FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.villa_id = ? AND u.email_normalised = ?`,
      [villa.villaId, emailNormalised],
    );
    if (existingMember && existingMember.status === 'active') {
      throw conflict(`${existingMember.full_name} is already a member of this villa`);
    }

    // Re-inviting replaces the outstanding invitation rather than stacking a
    // second live token for the same person.
    execute(
      "UPDATE invitations SET status = 'revoked' WHERE villa_id = ? AND email_normalised = ? AND status = 'pending'",
      [villa.villaId, emailNormalised],
    );

    const token = newToken(32);
    const invitationId = newId();
    const expiresAt = new Date(Date.now() + config.invitationTtlDays * 86_400_000).toISOString();
    execute(
      `INSERT INTO invitations (id, villa_id, email, email_normalised, role_id, job_title, token_hash, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invitationId,
        villa.villaId,
        input.email.trim(),
        emailNormalised,
        role.id,
        input.jobTitle ?? null,
        hashOpaqueToken(token),
        auth.userId,
        expiresAt,
        new Date().toISOString(),
      ],
    );

    const link = `${config.appUrl}/invite/${token}`;
    const delivery = await sendEmail(
      invitationEmail({
        to: input.email.trim(),
        villaName: villa.villaName,
        inviterName: auth.fullName,
        roleName: role.name,
        link,
        expiresAt,
      }),
    );

    auditFromRequest(req, {
      action: 'invitation.sent',
      entityType: 'invitation',
      entityId: invitationId,
      summary: `Invited ${input.email.trim()} as ${role.name}`,
      metadata: { roleId: role.id, emailDelivered: delivery.delivered },
    });

    const row = queryOne<InvitationRow>(`${INVITATION_SELECT} WHERE i.id = ?`, [invitationId]);
    res.status(201).json({
      invitation: serialise(row as InvitationRow),
      // Returned so the inviter can share it directly — villa staff are often
      // easier to reach on WhatsApp than by email.
      inviteLink: link,
      emailDelivered: delivery.delivered,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /invitations/:invitationId/resend
// ---------------------------------------------------------------------------
invitationsRouter.post(
  '/:invitationId/resend',
  requirePermission('members:invite'),
  inviteLimiter,
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const invitation = queryOne<{ id: string; email: string; status: string; role_id: string }>(
      'SELECT id, email, status, role_id FROM invitations WHERE villa_id = ? AND id = ?',
      [villa.villaId, String(req.params.invitationId)],
    );
    if (!invitation) throw notFound('Invitation not found');
    if (invitation.status === 'accepted') throw conflict('That invitation has already been accepted');

    const role = queryOne<{ name: string }>('SELECT name FROM roles WHERE id = ?', [invitation.role_id]);
    // A fresh token invalidates the old link, which is the point of a resend.
    const token = newToken(32);
    const expiresAt = new Date(Date.now() + config.invitationTtlDays * 86_400_000).toISOString();
    execute(
      "UPDATE invitations SET token_hash = ?, expires_at = ?, status = 'pending' WHERE id = ?",
      [hashOpaqueToken(token), expiresAt, invitation.id],
    );

    const link = `${config.appUrl}/invite/${token}`;
    const delivery = await sendEmail(
      invitationEmail({
        to: invitation.email,
        villaName: villa.villaName,
        inviterName: auth.fullName,
        roleName: role?.name ?? 'Staff',
        link,
        expiresAt,
      }),
    );
    auditFromRequest(req, {
      action: 'invitation.resent',
      entityType: 'invitation',
      entityId: invitation.id,
      summary: `Resent invitation to ${invitation.email}`,
    });
    res.json({ inviteLink: link, emailDelivered: delivery.delivered, expiresAt });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /invitations/:invitationId
// ---------------------------------------------------------------------------
invitationsRouter.delete(
  '/:invitationId',
  requirePermission('members:invite'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const invitation = queryOne<{ id: string; email: string; status: string }>(
      'SELECT id, email, status FROM invitations WHERE villa_id = ? AND id = ?',
      [villa.villaId, String(req.params.invitationId)],
    );
    if (!invitation) throw notFound('Invitation not found');
    if (invitation.status === 'accepted') throw conflict('That invitation has already been accepted');

    execute("UPDATE invitations SET status = 'revoked' WHERE id = ?", [invitation.id]);
    auditFromRequest(req, {
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: invitation.id,
      summary: `Revoked invitation for ${invitation.email}`,
    });
    res.status(204).end();
  }),
);
