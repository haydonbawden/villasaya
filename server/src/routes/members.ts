import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { can, requireVilla, resolveEffective } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { parseBody } from '../lib/validate.ts';
import { isPermissionKey, parsePermissionList } from '../permissions.ts';
import { refreshVillaAccess } from '../realtime/hub.ts';

export const membersRouter = Router({ mergeParams: true });

type MemberRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_colour: string;
  last_seen_at: string | null;
  job_title: string | null;
  employment_type: string;
  pay_rate_minor: number | null;
  pay_period: string;
  annual_leave_days: number;
  started_on: string | null;
  ended_on: string | null;
  status: string;
  permission_overrides: string;
  role_id: string;
  role_key: string;
  role_name: string;
  role_colour: string;
  role_permissions: string;
  is_owner: number;
};

const MEMBER_SELECT = `
  SELECT m.id, m.user_id, u.full_name, u.email, u.phone, u.avatar_colour, u.last_seen_at,
         m.job_title, m.employment_type, m.pay_rate_minor, m.pay_period, m.annual_leave_days,
         m.started_on, m.ended_on, m.status, m.permission_overrides,
         r.id AS role_id, r.key AS role_key, r.name AS role_name, r.colour AS role_colour,
         r.permissions AS role_permissions, r.is_owner
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    JOIN roles r ON r.id = m.role_id`;

/**
 * Pay details are gated behind `members:view_sensitive`, so the same endpoint
 * serves both a manager and a housekeeper without leaking salaries.
 */
function serialiseMember(row: MemberRow, includeSensitive: boolean) {
  const overrides = safeOverrides(row.permission_overrides);
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    avatarColour: row.avatar_colour,
    lastSeenAt: row.last_seen_at,
    jobTitle: row.job_title,
    status: row.status,
    role: {
      id: row.role_id,
      key: row.role_key,
      name: row.role_name,
      colour: row.role_colour,
      isOwner: row.is_owner === 1,
    },
    permissionOverrides: overrides,
    effectivePermissions: [...resolveEffective(row.role_permissions, row.permission_overrides)].filter(
      (key) => key !== '*',
    ),
    ...(includeSensitive
      ? {
          employmentType: row.employment_type,
          payRateMinor: row.pay_rate_minor,
          payPeriod: row.pay_period,
          annualLeaveDays: row.annual_leave_days,
          startedOn: row.started_on,
          endedOn: row.ended_on,
        }
      : {}),
  };
}

function safeOverrides(raw: string): { grant: string[]; deny: string[] } {
  try {
    const parsed = JSON.parse(raw) as { grant?: unknown; deny?: unknown };
    return {
      grant: Array.isArray(parsed.grant) ? (parsed.grant as string[]).filter(isPermissionKey) : [],
      deny: Array.isArray(parsed.deny) ? (parsed.deny as string[]).filter(isPermissionKey) : [],
    };
  } catch {
    return { grant: [], deny: [] };
  }
}

function loadMember(villaId: string, membershipId: string): MemberRow {
  const row = queryOne<MemberRow>(`${MEMBER_SELECT} WHERE m.villa_id = ? AND m.id = ?`, [villaId, membershipId]);
  if (!row) throw notFound('Staff member not found');
  return row;
}

// ---------------------------------------------------------------------------
// GET /members
// ---------------------------------------------------------------------------
membersRouter.get(
  '/',
  requirePermission('members:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const includeInactive = String(req.query.includeInactive ?? '') === 'true';
    const rows = query<MemberRow>(
      `${MEMBER_SELECT}
        WHERE m.villa_id = ? ${includeInactive ? '' : "AND m.status = 'active'"}
        ORDER BY r.is_owner DESC, r.rank, u.full_name`,
      [villa.villaId],
    );
    const includeSensitive = can(req, 'members:view_sensitive');
    res.json({ members: rows.map((row) => serialiseMember(row, includeSensitive)) });
  }),
);

// ---------------------------------------------------------------------------
// GET /members/:membershipId
// ---------------------------------------------------------------------------
membersRouter.get(
  '/:membershipId',
  requirePermission('members:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const row = loadMember(villa.villaId, String(req.params.membershipId));
    // Staff can always see their own employment details even without the
    // elevated permission.
    const includeSensitive = can(req, 'members:view_sensitive') || row.id === villa.membershipId;
    res.json({ member: serialiseMember(row, includeSensitive) });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /members/:membershipId
// ---------------------------------------------------------------------------
membersRouter.patch(
  '/:membershipId',
  requirePermission('members:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const member = loadMember(villa.villaId, String(req.params.membershipId));
    const input = parseBody(
      z.object({
        jobTitle: z.string().trim().max(80).nullable().optional(),
        employmentType: z.enum(['full_time', 'part_time', 'casual', 'contract']).optional(),
        payRateMinor: z.number().int().min(0).nullable().optional(),
        payPeriod: z.enum(['hour', 'day', 'week', 'month']).optional(),
        annualLeaveDays: z.number().min(0).max(365).optional(),
        startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        status: z.enum(['active', 'suspended']).optional(),
        roleId: z.string().trim().optional(),
      }),
      req,
    );

    if (member.is_owner === 1 && member.id !== villa.membershipId) {
      throw forbidden("The owner's membership can only be changed by the owner");
    }

    if (input.roleId !== undefined) {
      const target = queryOne<{ id: string; is_owner: number }>(
        'SELECT id, is_owner FROM roles WHERE villa_id = ? AND id = ?',
        [villa.villaId, input.roleId],
      );
      if (!target) throw badRequest('That role does not exist in this villa');
      // Handing over ownership is a separate, deliberate action.
      if (target.is_owner === 1) throw forbidden('Use the ownership transfer endpoint to make someone an owner');
      if (member.is_owner === 1) throw forbidden('The owner cannot be moved out of the owner role here');
    }

    if (input.status === 'suspended' && member.is_owner === 1) {
      throw forbidden('The owner cannot be suspended');
    }

    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
      updates.push(`${column} = ?`);
      params.push(value);
    };
    if (input.jobTitle !== undefined) set('job_title', input.jobTitle);
    if (input.employmentType !== undefined) set('employment_type', input.employmentType);
    if (input.payRateMinor !== undefined) set('pay_rate_minor', input.payRateMinor);
    if (input.payPeriod !== undefined) set('pay_period', input.payPeriod);
    if (input.annualLeaveDays !== undefined) set('annual_leave_days', input.annualLeaveDays);
    if (input.startedOn !== undefined) set('started_on', input.startedOn);
    if (input.status !== undefined) set('status', input.status);
    if (input.roleId !== undefined) set('role_id', input.roleId);

    if (updates.length === 0) {
      res.json({ member: serialiseMember(member, true) });
      return;
    }
    set('updated_at', new Date().toISOString());
    execute(`UPDATE memberships SET ${updates.join(', ')} WHERE id = ?`, [...params, member.id]);

    auditFromRequest(req, {
      action: 'membership.updated',
      entityType: 'membership',
      entityId: member.id,
      summary: `${member.full_name}'s record was updated`,
      metadata: input as Record<string, unknown>,
    });
    if (input.status !== undefined) refreshVillaAccess(member.user_id);
    res.json({ member: serialiseMember(loadMember(villa.villaId, member.id), true) });
  }),
);

// ---------------------------------------------------------------------------
// PUT /members/:membershipId/permissions — per-person grant/deny overrides
// ---------------------------------------------------------------------------
membersRouter.put(
  '/:membershipId/permissions',
  requirePermission('roles:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const member = loadMember(villa.villaId, String(req.params.membershipId));
    const input = parseBody(
      z.object({
        grant: z.array(z.string()).default([]),
        deny: z.array(z.string()).default([]),
      }),
      req,
    );

    const unknown = [...input.grant, ...input.deny].filter((key) => !isPermissionKey(key));
    if (unknown.length > 0) throw badRequest('Unknown permissions', { permissions: unknown });

    const overlap = input.grant.filter((key) => input.deny.includes(key));
    if (overlap.length > 0) {
      throw badRequest('A permission cannot be both granted and denied', { permissions: overlap });
    }
    if (member.is_owner === 1) {
      throw forbidden('The owner always holds every permission');
    }

    // A grant that the role already carries is noise; storing only the real
    // exceptions keeps the member record readable and stable across role edits.
    const rolePermissions = new Set(parsePermissionList(member.role_permissions));
    const grant = [...new Set(input.grant)].filter((key) => !rolePermissions.has(key));
    const deny = [...new Set(input.deny)];

    execute('UPDATE memberships SET permission_overrides = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify({ grant, deny }),
      new Date().toISOString(),
      member.id,
    ]);
    auditFromRequest(req, {
      action: 'membership.permissions_updated',
      entityType: 'membership',
      entityId: member.id,
      summary: `Permission exceptions updated for ${member.full_name}`,
      metadata: { grant, deny },
    });
    res.json({ member: serialiseMember(loadMember(villa.villaId, member.id), true) });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /members/:membershipId — soft removal, keeps history intact
// ---------------------------------------------------------------------------
membersRouter.delete(
  '/:membershipId',
  requirePermission('members:remove'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const member = loadMember(villa.villaId, String(req.params.membershipId));
    if (member.is_owner === 1) throw forbidden('The owner cannot be removed from their own villa');
    if (member.id === villa.membershipId) throw forbidden('You cannot remove yourself');

    // Rows are kept and the membership marked removed: deleting would take the
    // person's expense claims and roster history with it.
    execute(
      "UPDATE memberships SET status = 'removed', ended_on = ?, updated_at = ? WHERE id = ?",
      [new Date().toISOString().slice(0, 10), new Date().toISOString(), member.id],
    );
    execute('DELETE FROM channel_members WHERE membership_id = ?', [member.id]);
    auditFromRequest(req, {
      action: 'membership.removed',
      entityType: 'membership',
      entityId: member.id,
      summary: `${member.full_name} was removed from the villa`,
    });
    refreshVillaAccess(member.user_id);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// POST /members/:membershipId/transfer-ownership
// ---------------------------------------------------------------------------
membersRouter.post(
  '/:membershipId/transfer-ownership',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    if (!villa.isOwner) throw forbidden('Only the current owner can transfer ownership');
    const member = loadMember(villa.villaId, String(req.params.membershipId));
    if (member.id === villa.membershipId) throw conflict('You are already the owner');
    if (member.status !== 'active') throw badRequest('That member is not active');

    const input = parseBody(z.object({ confirmName: z.string() }), req);
    if (input.confirmName.trim() !== member.full_name) {
      throw badRequest("Type the new owner's full name exactly to confirm");
    }

    const ownerRole = queryOne<{ id: string }>(
      'SELECT id FROM roles WHERE villa_id = ? AND is_owner = 1',
      [villa.villaId],
    );
    const managerRole = queryOne<{ id: string }>(
      "SELECT id FROM roles WHERE villa_id = ? AND key = 'manager'",
      [villa.villaId],
    );
    if (!ownerRole || !managerRole) throw conflict('This villa is missing its built-in roles');

    const now = new Date().toISOString();
    execute('UPDATE memberships SET role_id = ?, updated_at = ? WHERE id = ?', [ownerRole.id, now, member.id]);
    // The outgoing owner keeps full operational access as a manager.
    execute('UPDATE memberships SET role_id = ?, updated_at = ? WHERE id = ?', [
      managerRole.id,
      now,
      villa.membershipId,
    ]);
    execute('UPDATE villas SET created_by = ?, updated_at = ? WHERE id = ?', [member.user_id, now, villa.villaId]);

    auditFromRequest(req, {
      action: 'villa.ownership_transferred',
      entityType: 'membership',
      entityId: member.id,
      summary: `Ownership transferred to ${member.full_name}`,
    });
    res.json({ transferredTo: member.id });
  }),
);
