import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { accessScope, can, requireAuth, requireVilla } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { countLeaveDays } from '../lib/dates.ts';
import { membershipsWithPermission, notify } from '../lib/notify.ts';
import { colourSchema, isoDateSchema, parseBody, parseQuery } from '../lib/validate.ts';
import { emitToVilla } from '../realtime/hub.ts';

export const leaveRouter = Router({ mergeParams: true });

type LeaveRow = {
  id: string;
  membership_id: string;
  staff_name: string;
  avatar_colour: string;
  leave_type_id: string;
  leave_type_name: string;
  leave_type_colour: string;
  is_paid: number;
  start_date: string;
  end_date: string;
  start_half_day: number;
  end_half_day: number;
  total_days: number;
  reason: string | null;
  status: string;
  decision_note: string | null;
  decided_at: string | null;
  decider_name: string | null;
  created_at: string;
};

const LEAVE_SELECT = `
  SELECT lr.id, lr.membership_id, u.full_name AS staff_name, u.avatar_colour,
         lr.leave_type_id, lt.name AS leave_type_name, lt.colour AS leave_type_colour, lt.is_paid,
         lr.start_date, lr.end_date, lr.start_half_day, lr.end_half_day, lr.total_days,
         lr.reason, lr.status, lr.decision_note, lr.decided_at, lr.created_at,
         du.full_name AS decider_name
    FROM leave_requests lr
    JOIN memberships m ON m.id = lr.membership_id
    JOIN users u ON u.id = m.user_id
    JOIN leave_types lt ON lt.id = lr.leave_type_id
    LEFT JOIN users du ON du.id = lr.decided_by`;

function serialise(row: LeaveRow) {
  return {
    id: row.id,
    membershipId: row.membership_id,
    staffName: row.staff_name,
    avatarColour: row.avatar_colour,
    leaveType: {
      id: row.leave_type_id,
      name: row.leave_type_name,
      colour: row.leave_type_colour,
      isPaid: row.is_paid === 1,
    },
    startDate: row.start_date,
    endDate: row.end_date,
    startHalfDay: row.start_half_day === 1,
    endHalfDay: row.end_half_day === 1,
    totalDays: row.total_days,
    reason: row.reason,
    status: row.status,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    decidedBy: row.decider_name,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------
leaveRouter.get(
  '/types',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const rows = query<{
      id: string; name: string; colour: string; is_paid: number; requires_approval: number;
    }>(
      `SELECT id, name, colour, is_paid, requires_approval
         FROM leave_types WHERE villa_id = ? AND is_archived = 0 ORDER BY name`,
      [villa.villaId],
    );
    res.json({
      types: rows.map((row) => ({
        id: row.id,
        name: row.name,
        colour: row.colour,
        isPaid: row.is_paid === 1,
        requiresApproval: row.requires_approval === 1,
      })),
    });
  }),
);

leaveRouter.post(
  '/types',
  requirePermission('leave:manage_types'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(60),
        colour: colourSchema.default('#a855f7'),
        isPaid: z.boolean().default(true),
        requiresApproval: z.boolean().default(true),
      }),
      req,
    );
    const id = newId();
    execute(
      `INSERT INTO leave_types (id, villa_id, name, colour, is_paid, requires_approval, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, villa.villaId, input.name, input.colour, input.isPaid, input.requiresApproval, new Date().toISOString()],
    );
    auditFromRequest(req, { action: 'leave_type.created', entityType: 'leave_type', entityId: id, summary: `Leave type "${input.name}" created` });
    res.status(201).json({ type: { id, ...input } });
  }),
);

leaveRouter.patch(
  '/types/:typeId',
  requirePermission('leave:manage_types'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(60).optional(),
        colour: colourSchema.optional(),
        isPaid: z.boolean().optional(),
        requiresApproval: z.boolean().optional(),
        isArchived: z.boolean().optional(),
      }),
      req,
    );
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => { updates.push(`${column} = ?`); params.push(value); };
    if (input.name !== undefined) set('name', input.name);
    if (input.colour !== undefined) set('colour', input.colour);
    if (input.isPaid !== undefined) set('is_paid', input.isPaid ? 1 : 0);
    if (input.requiresApproval !== undefined) set('requires_approval', input.requiresApproval ? 1 : 0);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);
    if (updates.length === 0) { res.json({ updated: false }); return; }

    const changed = execute(`UPDATE leave_types SET ${updates.join(', ')} WHERE id = ? AND villa_id = ?`, [
      ...params, String(req.params.typeId), villa.villaId,
    ]);
    if (changed.changes === 0) throw notFound('Leave type not found');
    res.json({ updated: true });
  }),
);

// ---------------------------------------------------------------------------
// GET /leave — requests
// ---------------------------------------------------------------------------
leaveRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const scope = accessScope(req, 'leave');
    if (scope === 'none') throw forbidden('You do not have permission to view leave');

    const filters = parseQuery(
      z.object({
        status: z.string().trim().optional(),
        membershipId: z.string().trim().optional(),
        leaveTypeId: z.string().trim().optional(),
        from: z.string().trim().optional(),
        to: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      req,
    );

    const where: string[] = ['lr.villa_id = ?'];
    const params: (string | number)[] = [villa.villaId];
    if (scope === 'own') {
      where.push('lr.membership_id = ?');
      params.push(villa.membershipId);
    } else if (filters.membershipId) {
      where.push('lr.membership_id = ?');
      params.push(filters.membershipId);
    }
    if (filters.status) {
      const statuses = filters.status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        where.push(`lr.status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      }
    }
    if (filters.leaveTypeId) { where.push('lr.leave_type_id = ?'); params.push(filters.leaveTypeId); }
    if (filters.from) { where.push('lr.end_date >= ?'); params.push(filters.from); }
    if (filters.to) { where.push('lr.start_date <= ?'); params.push(filters.to); }

    const clause = where.join(' AND ');
    const rows = query<LeaveRow>(
      `${LEAVE_SELECT} WHERE ${clause} ORDER BY lr.start_date DESC LIMIT ?`,
      [...params, filters.limit],
    );

    // Totals describe the whole filtered set, not just the page of rows above,
    // so narrowing the filter is what changes the number — not scrolling.
    // Cancelled and declined leave was never taken, so it is not counted.
    const totals = query<{ status: string; leave_type_id: string; leave_type_name: string; days: number; count: number }>(
      `SELECT lr.status, lr.leave_type_id, lt.name AS leave_type_name,
              SUM(lr.total_days) AS days, COUNT(*) AS count
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE ${clause}
        GROUP BY lr.status, lr.leave_type_id, lt.name`,
      params,
    );
    const counted = totals.filter((row) => row.status === 'approved' || row.status === 'pending');
    const byType = new Map<string, { leaveTypeId: string; leaveTypeName: string; days: number; requests: number }>();
    for (const row of counted) {
      const entry = byType.get(row.leave_type_id)
        ?? { leaveTypeId: row.leave_type_id, leaveTypeName: row.leave_type_name, days: 0, requests: 0 };
      entry.days += row.days;
      entry.requests += row.count;
      byType.set(row.leave_type_id, entry);
    }

    res.json({
      requests: rows.map(serialise),
      totals: {
        days: counted.reduce((sum, row) => sum + row.days, 0),
        requests: counted.reduce((sum, row) => sum + row.count, 0),
        pendingDays: totals.filter((r) => r.status === 'pending').reduce((sum, r) => sum + r.days, 0),
        byType: [...byType.values()].sort((a, b) => b.days - a.days),
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /leave — request leave
// ---------------------------------------------------------------------------
leaveRouter.post(
  '/',
  requirePermission('leave:request'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        leaveTypeId: z.string().trim().min(1, 'Choose a leave type'),
        startDate: isoDateSchema,
        endDate: isoDateSchema,
        startHalfDay: z.boolean().default(false),
        endHalfDay: z.boolean().default(false),
        reason: z.string().trim().max(1000).optional(),
        /** Managers may file leave on behalf of a staff member. */
        membershipId: z.string().trim().optional(),
      }),
      req,
    );

    const membershipId = input.membershipId ?? villa.membershipId;
    if (membershipId !== villa.membershipId && !can(req, 'leave:approve')) {
      throw forbidden('You can only request leave for yourself');
    }
    if (input.endDate < input.startDate) {
      throw badRequest('The end date cannot be before the start date', { endDate: 'Must be on or after the start date' });
    }

    const leaveType = queryOne<{ id: string; name: string; requires_approval: number }>(
      'SELECT id, name, requires_approval FROM leave_types WHERE id = ? AND villa_id = ? AND is_archived = 0',
      [input.leaveTypeId, villa.villaId],
    );
    if (!leaveType) throw badRequest('That leave type does not exist');

    // Overlapping leave is almost always a mistake rather than an intent.
    const overlap = queryOne<{ id: string; start_date: string; end_date: string }>(
      `SELECT id, start_date, end_date FROM leave_requests
        WHERE membership_id = ? AND status IN ('pending', 'approved')
          AND start_date <= ? AND end_date >= ? LIMIT 1`,
      [membershipId, input.endDate, input.startDate],
    );
    if (overlap) {
      throw conflict('You already have leave booked over those dates', {
        conflictingRequestId: overlap.id,
        startDate: overlap.start_date,
        endDate: overlap.end_date,
      });
    }

    const totalDays = countLeaveDays(input.startDate, input.endDate, input.startHalfDay, input.endHalfDay);
    if (totalDays <= 0) throw badRequest('That leave request does not cover any days');

    // Auto-approval covers leave types the villa does not gate, so unpaid or
    // informal leave does not sit waiting on a manager.
    const autoApprove = leaveType.requires_approval === 0;
    const now = new Date().toISOString();
    const leaveId = newId();
    execute(
      `INSERT INTO leave_requests (id, villa_id, membership_id, leave_type_id, start_date, end_date,
                                   start_half_day, end_half_day, total_days, reason, status, decided_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [leaveId, villa.villaId, membershipId, leaveType.id, input.startDate, input.endDate,
       input.startHalfDay, input.endHalfDay, totalDays, input.reason ?? null,
       autoApprove ? 'approved' : 'pending', autoApprove ? now : null, now, now],
    );

    if (!autoApprove) {
      notify({
        villaId: villa.villaId,
        membershipIds: membershipsWithPermission(villa.villaId, 'leave:approve'),
        actorMembershipId: villa.membershipId,
        kind: 'leave.requested',
        title: 'Leave request needs approval',
        body: `${leaveType.name}: ${input.startDate} to ${input.endDate} (${totalDays} days)`,
        link: `/villas/${villa.villaId}/leave`,
        payload: { leaveId },
      });
    }
    auditFromRequest(req, {
      action: 'leave.requested',
      entityType: 'leave_request',
      entityId: leaveId,
      summary: `${leaveType.name} requested for ${input.startDate} to ${input.endDate}`,
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'leave' } });

    const row = queryOne<LeaveRow>(`${LEAVE_SELECT} WHERE lr.id = ?`, [leaveId]);
    res.status(201).json({ request: serialise(row as LeaveRow) });
  }),
);

// ---------------------------------------------------------------------------
// POST /leave/:leaveId/decision
// ---------------------------------------------------------------------------
leaveRouter.post(
  '/:leaveId/decision',
  requirePermission('leave:approve'),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const leave = queryOne<LeaveRow>(`${LEAVE_SELECT} WHERE lr.villa_id = ? AND lr.id = ?`, [
      villa.villaId, String(req.params.leaveId),
    ]);
    if (!leave) throw notFound('Leave request not found');
    if (leave.status !== 'pending') throw conflict('That leave request has already been decided');
    if (leave.membership_id === villa.membershipId) {
      throw forbidden('You cannot approve your own leave request');
    }

    const input = parseBody(
      z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }),
      req,
    );
    const now = new Date().toISOString();
    execute(
      'UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?',
      [input.decision, auth.userId, now, input.note ?? null, now, leave.id],
    );

    notify({
      villaId: villa.villaId,
      membershipIds: [leave.membership_id],
      actorMembershipId: villa.membershipId,
      kind: `leave.${input.decision}`,
      title: input.decision === 'approved' ? 'Leave approved' : 'Leave request declined',
      body: `${leave.leave_type_name}: ${leave.start_date} to ${leave.end_date}`,
      link: `/villas/${villa.villaId}/leave`,
      payload: { leaveId: leave.id },
    });
    auditFromRequest(req, {
      action: `leave.${input.decision}`,
      entityType: 'leave_request',
      entityId: leave.id,
      summary: `${leave.staff_name}'s ${leave.leave_type_name} was ${input.decision}`,
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'leave' } });
    res.json({ status: input.decision });
  }),
);

// ---------------------------------------------------------------------------
// POST /leave/:leaveId/cancel
// ---------------------------------------------------------------------------
leaveRouter.post(
  '/:leaveId/cancel',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const leave = queryOne<LeaveRow>(`${LEAVE_SELECT} WHERE lr.villa_id = ? AND lr.id = ?`, [
      villa.villaId, String(req.params.leaveId),
    ]);
    if (!leave) throw notFound('Leave request not found');
    const isOwnRequest = leave.membership_id === villa.membershipId;
    if (!isOwnRequest && !can(req, 'leave:approve')) throw forbidden('You cannot cancel this request');
    if (leave.status === 'cancelled') { res.json({ status: 'cancelled' }); return; }
    if (leave.status === 'rejected') throw conflict('A declined request cannot be cancelled');

    execute("UPDATE leave_requests SET status = 'cancelled', updated_at = ? WHERE id = ?", [
      new Date().toISOString(), leave.id,
    ]);
    if (!isOwnRequest) {
      notify({
        villaId: villa.villaId,
        membershipIds: [leave.membership_id],
        actorMembershipId: villa.membershipId,
        kind: 'leave.cancelled',
        title: 'Leave request cancelled',
        body: `${leave.leave_type_name}: ${leave.start_date} to ${leave.end_date}`,
        link: `/villas/${villa.villaId}/leave`,
        payload: { leaveId: leave.id },
      });
    }
    auditFromRequest(req, { action: 'leave.cancelled', entityType: 'leave_request', entityId: leave.id });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'leave' } });
    res.json({ status: 'cancelled' });
  }),
);
