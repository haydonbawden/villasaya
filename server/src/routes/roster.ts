import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, transaction } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { accessScope, can, requireAuth, requireVilla } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { minutesBetween } from '../lib/dates.ts';
import { membershipsWithPermission, notify } from '../lib/notify.ts';
import { isoDateTimeSchema, parseBody, parseQuery } from '../lib/validate.ts';
import { emitToVilla } from '../realtime/hub.ts';

export const rosterRouter = Router({ mergeParams: true });

type ShiftRow = {
  id: string;
  membership_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  location: string | null;
  notes: string | null;
  status: string;
  published_at: string | null;
  staff_name: string | null;
  avatar_colour: string | null;
  job_title: string | null;
};

const SHIFT_SELECT = `
  SELECT s.id, s.membership_id, s.title, s.starts_at, s.ends_at, s.break_minutes, s.location, s.notes,
         s.status, s.published_at, u.full_name AS staff_name, u.avatar_colour, m.job_title
    FROM shifts s
    LEFT JOIN memberships m ON m.id = s.membership_id
    LEFT JOIN users u ON u.id = m.user_id`;

function serialise(row: ShiftRow) {
  const paidMinutes = Math.max(0, minutesBetween(row.starts_at, row.ends_at) - row.break_minutes);
  return {
    id: row.id,
    membershipId: row.membership_id,
    staffName: row.staff_name,
    avatarColour: row.avatar_colour,
    jobTitle: row.job_title,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    breakMinutes: row.break_minutes,
    paidMinutes,
    location: row.location,
    notes: row.notes,
    status: row.status,
    publishedAt: row.published_at,
    isOpen: row.membership_id === null,
  };
}

function loadShift(villaId: string, shiftId: string): ShiftRow {
  const row = queryOne<ShiftRow>(`${SHIFT_SELECT} WHERE s.villa_id = ? AND s.id = ?`, [villaId, shiftId]);
  if (!row) throw notFound('Shift not found');
  return row;
}

/**
 * Rejects a shift that overlaps one the same person already has. Rosters get
 * built quickly and double-booking a housekeeper is the mistake this catches.
 */
function assertNoClash(villaId: string, membershipId: string, startsAt: string, endsAt: string, ignoreShiftId?: string): void {
  const clash = queryOne<{ id: string; starts_at: string; ends_at: string }>(
    `SELECT id, starts_at, ends_at FROM shifts
      WHERE villa_id = ? AND membership_id = ? AND status != 'cancelled'
        AND starts_at < ? AND ends_at > ?
        ${ignoreShiftId ? 'AND id != ?' : ''}
      LIMIT 1`,
    ignoreShiftId
      ? [villaId, membershipId, endsAt, startsAt, ignoreShiftId]
      : [villaId, membershipId, endsAt, startsAt],
  );
  if (clash) {
    throw conflict('That person already has a shift overlapping these hours', {
      conflictingShiftId: clash.id,
      startsAt: clash.starts_at,
      endsAt: clash.ends_at,
    });
  }
}

/** Warns (does not block) when a shift lands inside approved leave. */
function leaveWarning(villaId: string, membershipId: string, startsAt: string, endsAt: string): string | null {
  const onLeave = queryOne<{ start_date: string; end_date: string; name: string }>(
    `SELECT lr.start_date, lr.end_date, lt.name
       FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.villa_id = ? AND lr.membership_id = ? AND lr.status = 'approved'
        AND lr.start_date <= ? AND lr.end_date >= ?
      LIMIT 1`,
    [villaId, membershipId, endsAt.slice(0, 10), startsAt.slice(0, 10)],
  );
  return onLeave ? `This person has approved ${onLeave.name} from ${onLeave.start_date} to ${onLeave.end_date}` : null;
}

// ---------------------------------------------------------------------------
// GET /roster
// ---------------------------------------------------------------------------
rosterRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const scope = accessScope(req, 'roster');
    if (scope === 'none') throw forbidden('You do not have permission to view the roster');

    const filters = parseQuery(
      z.object({
        from: z.string().trim().optional(),
        to: z.string().trim().optional(),
        membershipId: z.string().trim().optional(),
        includeDrafts: z.coerce.boolean().default(false),
      }),
      req,
    );

    const where: string[] = ['s.villa_id = ?'];
    const params: (string | number)[] = [villa.villaId];
    if (filters.from) { where.push('s.ends_at >= ?'); params.push(new Date(filters.from).toISOString()); }
    if (filters.to) { where.push('s.starts_at <= ?'); params.push(new Date(filters.to).toISOString()); }

    if (scope === 'own') {
      // Own-scope staff see their own shifts plus unclaimed open shifts, and
      // only once the roster has been published.
      where.push('(s.membership_id = ? OR s.membership_id IS NULL)');
      params.push(villa.membershipId);
      where.push("s.status = 'published'");
    } else {
      if (filters.membershipId) { where.push('s.membership_id = ?'); params.push(filters.membershipId); }
      if (!filters.includeDrafts || !can(req, 'roster:manage')) {
        where.push("s.status = 'published'");
      } else {
        where.push("s.status != 'cancelled'");
      }
    }

    const rows = query<ShiftRow>(
      `${SHIFT_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.starts_at, u.full_name LIMIT 1000`,
      params,
    );
    res.json({ shifts: rows.map(serialise) });
  }),
);

// ---------------------------------------------------------------------------
// POST /roster — create a shift (draft by default)
// ---------------------------------------------------------------------------
const shiftSchema = z.object({
  membershipId: z.string().trim().nullable().optional(),
  title: z.string().trim().min(1).max(80).default('Shift'),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  breakMinutes: z.number().int().min(0).max(600).default(0),
  location: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  publish: z.boolean().default(false),
});

rosterRouter.post(
  '/',
  requirePermission('roster:manage'),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const input = parseBody(shiftSchema, req);
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
      throw badRequest('The shift must end after it starts', { endsAt: 'Must be after the start time' });
    }
    if (input.publish && !can(req, 'roster:publish')) {
      throw forbidden('You do not have permission to publish the roster');
    }

    let warning: string | null = null;
    if (input.membershipId) {
      assertMemberActive(villa.villaId, input.membershipId);
      assertNoClash(villa.villaId, input.membershipId, input.startsAt, input.endsAt);
      warning = leaveWarning(villa.villaId, input.membershipId, input.startsAt, input.endsAt);
    }

    const now = new Date().toISOString();
    const shiftId = newId();
    const status = input.publish ? 'published' : 'draft';
    execute(
      `INSERT INTO shifts (id, villa_id, membership_id, title, starts_at, ends_at, break_minutes, location, notes, status, published_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shiftId, villa.villaId, input.membershipId ?? null, input.title, input.startsAt, input.endsAt,
       input.breakMinutes, input.location ?? null, input.notes ?? null, status, input.publish ? now : null,
       auth.userId, now, now],
    );

    if (input.publish && input.membershipId) {
      notify({
        villaId: villa.villaId,
        membershipIds: [input.membershipId],
        actorMembershipId: villa.membershipId,
        kind: 'shift.published',
        title: 'New shift on your roster',
        body: `${input.title} — ${new Date(input.startsAt).toUTCString()}`,
        link: `/villas/${villa.villaId}/roster`,
        payload: { shiftId },
      });
    }
    auditFromRequest(req, { action: 'shift.created', entityType: 'shift', entityId: shiftId, summary: `Shift created` });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'roster' } });
    res.status(201).json({ shift: serialise(loadShift(villa.villaId, shiftId)), warning });
  }),
);

function assertMemberActive(villaId: string, membershipId: string): void {
  const exists = queryOne("SELECT 1 AS ok FROM memberships WHERE id = ? AND villa_id = ? AND status = 'active'", [
    membershipId, villaId,
  ]);
  if (!exists) throw badRequest('That person is not an active member of this villa');
}

// ---------------------------------------------------------------------------
// PATCH /roster/:shiftId
// ---------------------------------------------------------------------------
rosterRouter.patch(
  '/:shiftId',
  requirePermission('roster:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const shift = loadShift(villa.villaId, String(req.params.shiftId));
    const input = parseBody(shiftSchema.partial().omit({ publish: true }), req);

    const startsAt = input.startsAt ?? shift.starts_at;
    const endsAt = input.endsAt ?? shift.ends_at;
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw badRequest('The shift must end after it starts', { endsAt: 'Must be after the start time' });
    }
    const membershipId = input.membershipId === undefined ? shift.membership_id : input.membershipId;
    let warning: string | null = null;
    if (membershipId) {
      assertMemberActive(villa.villaId, membershipId);
      assertNoClash(villa.villaId, membershipId, startsAt, endsAt, shift.id);
      warning = leaveWarning(villa.villaId, membershipId, startsAt, endsAt);
    }

    execute(
      `UPDATE shifts SET membership_id = ?, title = ?, starts_at = ?, ends_at = ?, break_minutes = ?,
              location = ?, notes = ?, updated_at = ?
        WHERE id = ?`,
      [membershipId, input.title ?? shift.title, startsAt, endsAt, input.breakMinutes ?? shift.break_minutes,
       input.location === undefined ? shift.location : input.location,
       input.notes === undefined ? shift.notes : input.notes,
       new Date().toISOString(), shift.id],
    );

    // A change to an already-published shift is news the staff member needs.
    if (shift.status === 'published' && membershipId) {
      notify({
        villaId: villa.villaId,
        membershipIds: [membershipId],
        actorMembershipId: villa.membershipId,
        kind: 'shift.updated',
        title: 'A shift on your roster changed',
        body: `${input.title ?? shift.title} — ${new Date(startsAt).toUTCString()}`,
        link: `/villas/${villa.villaId}/roster`,
        payload: { shiftId: shift.id },
      });
    }
    auditFromRequest(req, { action: 'shift.updated', entityType: 'shift', entityId: shift.id });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'roster' } });
    res.json({ shift: serialise(loadShift(villa.villaId, shift.id)), warning });
  }),
);

// ---------------------------------------------------------------------------
// POST /roster/publish — release drafts across a date range
// ---------------------------------------------------------------------------
rosterRouter.post(
  '/publish',
  requirePermission('roster:publish'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(z.object({ from: isoDateTimeSchema, to: isoDateTimeSchema }), req);

    const drafts = query<{ id: string; membership_id: string | null; title: string; starts_at: string }>(
      `SELECT id, membership_id, title, starts_at FROM shifts
        WHERE villa_id = ? AND status = 'draft' AND starts_at >= ? AND starts_at <= ?`,
      [villa.villaId, input.from, input.to],
    );
    if (drafts.length === 0) {
      res.json({ published: 0 });
      return;
    }

    const now = new Date().toISOString();
    transaction(() => {
      execute(
        `UPDATE shifts SET status = 'published', published_at = ?, updated_at = ?
          WHERE villa_id = ? AND status = 'draft' AND starts_at >= ? AND starts_at <= ?`,
        [now, now, villa.villaId, input.from, input.to],
      );
    });

    // One notification per person, not per shift.
    const byMember = new Map<string, number>();
    for (const draft of drafts) {
      if (!draft.membership_id) continue;
      byMember.set(draft.membership_id, (byMember.get(draft.membership_id) ?? 0) + 1);
    }
    for (const [membershipId, count] of byMember) {
      notify({
        villaId: villa.villaId,
        membershipIds: [membershipId],
        actorMembershipId: villa.membershipId,
        kind: 'roster.published',
        title: 'Your roster has been published',
        body: `${count} shift${count === 1 ? '' : 's'} added to your schedule`,
        link: `/villas/${villa.villaId}/roster`,
        payload: { count },
      });
    }
    auditFromRequest(req, {
      action: 'roster.published',
      entityType: 'villa',
      entityId: villa.villaId,
      summary: `Published ${drafts.length} shift${drafts.length === 1 ? '' : 's'}`,
      metadata: { from: input.from, to: input.to },
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'roster' } });
    res.json({ published: drafts.length });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /roster/:shiftId
// ---------------------------------------------------------------------------
rosterRouter.delete(
  '/:shiftId',
  requirePermission('roster:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const shift = loadShift(villa.villaId, String(req.params.shiftId));
    if (shift.status === 'published' && shift.membership_id) {
      notify({
        villaId: villa.villaId,
        membershipIds: [shift.membership_id],
        actorMembershipId: villa.membershipId,
        kind: 'shift.cancelled',
        title: 'A shift was removed from your roster',
        body: `${shift.title} — ${new Date(shift.starts_at).toUTCString()}`,
        link: `/villas/${villa.villaId}/roster`,
        payload: { shiftId: shift.id },
      });
    }
    execute('DELETE FROM shifts WHERE id = ? AND villa_id = ?', [shift.id, villa.villaId]);
    auditFromRequest(req, { action: 'shift.deleted', entityType: 'shift', entityId: shift.id });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'roster' } });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Shift swaps
// ---------------------------------------------------------------------------
rosterRouter.get(
  '/swaps',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const canApprove = can(req, 'roster:swap.approve');
    const rows = query<{
      id: string; status: string; reason: string | null; created_at: string;
      shift_id: string; starts_at: string; ends_at: string; title: string;
      requester: string; target: string | null; decision_note: string | null;
    }>(
      `SELECT sr.id, sr.status, sr.reason, sr.created_at, sr.decision_note,
              s.id AS shift_id, s.starts_at, s.ends_at, s.title,
              ru.full_name AS requester, tu.full_name AS target
         FROM shift_swap_requests sr
         JOIN shifts s ON s.id = sr.shift_id
         JOIN memberships rm ON rm.id = sr.requested_by
         JOIN users ru ON ru.id = rm.user_id
         LEFT JOIN memberships tm ON tm.id = sr.requested_to
         LEFT JOIN users tu ON tu.id = tm.user_id
        WHERE sr.villa_id = ?
          ${canApprove ? '' : 'AND (sr.requested_by = ? OR sr.requested_to = ?)'}
        ORDER BY sr.created_at DESC LIMIT 200`,
      canApprove ? [villa.villaId] : [villa.villaId, villa.membershipId, villa.membershipId],
    );
    res.json({ swaps: rows });
  }),
);

rosterRouter.post(
  '/:shiftId/swap',
  requirePermission('roster:swap.request'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const shift = loadShift(villa.villaId, String(req.params.shiftId));
    if (shift.membership_id !== villa.membershipId) {
      throw forbidden('You can only request a swap for your own shift');
    }
    if (Date.parse(shift.starts_at) < Date.now()) throw badRequest('That shift has already started');

    const input = parseBody(
      z.object({
        requestedTo: z.string().trim().nullable().optional(),
        reason: z.string().trim().max(500).optional(),
      }),
      req,
    );
    if (input.requestedTo) assertMemberActive(villa.villaId, input.requestedTo);

    const existing = queryOne("SELECT 1 AS ok FROM shift_swap_requests WHERE shift_id = ? AND status = 'pending'", [shift.id]);
    if (existing) throw conflict('There is already an open swap request for this shift');

    const swapId = newId();
    execute(
      `INSERT INTO shift_swap_requests (id, villa_id, shift_id, requested_by, requested_to, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [swapId, villa.villaId, shift.id, villa.membershipId, input.requestedTo ?? null, input.reason ?? null, new Date().toISOString()],
    );

    // A named colleague is asked directly; an open request goes to approvers.
    const recipients = input.requestedTo
      ? [input.requestedTo]
      : membershipsWithPermission(villa.villaId, 'roster:swap.approve');
    notify({
      villaId: villa.villaId,
      membershipIds: recipients,
      actorMembershipId: villa.membershipId,
      kind: 'swap.requested',
      title: 'Shift swap requested',
      body: `${shift.title} on ${new Date(shift.starts_at).toUTCString()}`,
      link: `/villas/${villa.villaId}/roster`,
      payload: { swapId, shiftId: shift.id },
    });
    res.status(201).json({ swapId });
  }),
);

rosterRouter.post(
  '/swaps/:swapId/decision',
  requirePermission('roster:swap.approve'),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const swap = queryOne<{ id: string; shift_id: string; requested_by: string; requested_to: string | null; status: string }>(
      'SELECT id, shift_id, requested_by, requested_to, status FROM shift_swap_requests WHERE villa_id = ? AND id = ?',
      [villa.villaId, String(req.params.swapId)],
    );
    if (!swap) throw notFound('Swap request not found');
    if (swap.status !== 'pending' && swap.status !== 'accepted') {
      throw conflict('That swap request has already been decided');
    }

    const input = parseBody(
      z.object({
        decision: z.enum(['approved', 'rejected']),
        note: z.string().trim().max(500).optional(),
        /** Who picks the shift up; defaults to whoever was asked. */
        assignTo: z.string().trim().nullable().optional(),
      }),
      req,
    );

    const now = new Date().toISOString();
    transaction(() => {
      execute(
        'UPDATE shift_swap_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?',
        [input.decision, auth.userId, now, input.note ?? null, swap.id],
      );
      if (input.decision === 'approved') {
        const newHolder = input.assignTo ?? swap.requested_to;
        if (newHolder) assertMemberActive(villa.villaId, newHolder);
        execute('UPDATE shifts SET membership_id = ?, updated_at = ? WHERE id = ?', [newHolder ?? null, now, swap.shift_id]);
      }
    });

    notify({
      villaId: villa.villaId,
      membershipIds: [swap.requested_by, ...(swap.requested_to ? [swap.requested_to] : []), ...(input.assignTo ? [input.assignTo] : [])],
      actorMembershipId: villa.membershipId,
      kind: `swap.${input.decision}`,
      title: input.decision === 'approved' ? 'Shift swap approved' : 'Shift swap rejected',
      body: input.note ?? null,
      link: `/villas/${villa.villaId}/roster`,
      payload: { swapId: swap.id },
    });
    auditFromRequest(req, {
      action: `swap.${input.decision}`,
      entityType: 'shift_swap',
      entityId: swap.id,
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'roster' } });
    res.json({ status: input.decision });
  }),
);
