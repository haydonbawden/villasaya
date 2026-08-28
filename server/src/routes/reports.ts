import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { accessScope, can, requireVilla } from '../auth/context.ts';
import { parseQuery } from '../lib/validate.ts';
import { today } from '../lib/dates.ts';

export const reportsRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// GET /reports/dashboard — the landing screen, tailored to what the caller sees
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const now = new Date().toISOString();
    const day = today(villa.timezone);
    const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString();

    const taskScope = accessScope(req, 'tasks');
    const myOpenTasks = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM tasks t
        WHERE t.villa_id = ? AND t.status IN ('todo', 'in_progress', 'blocked')
          AND EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.membership_id = ?)`,
      [villa.villaId, villa.membershipId],
    );
    const myOverdueTasks = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM tasks t
        WHERE t.villa_id = ? AND t.status IN ('todo', 'in_progress', 'blocked')
          AND t.due_at IS NOT NULL AND t.due_at < ?
          AND EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.membership_id = ?)`,
      [villa.villaId, now, villa.membershipId],
    );

    const myShifts = query<{ id: string; title: string; starts_at: string; ends_at: string; location: string | null }>(
      `SELECT id, title, starts_at, ends_at, location FROM shifts
        WHERE villa_id = ? AND membership_id = ? AND status = 'published' AND ends_at >= ?
        ORDER BY starts_at LIMIT 5`,
      [villa.villaId, villa.membershipId, now],
    );

    const myClaims = queryOne<{ pending: number; pending_amount: number }>(
      `SELECT COUNT(*) AS pending, COALESCE(SUM(amount_minor), 0) AS pending_amount
         FROM expense_claims WHERE villa_id = ? AND membership_id = ? AND status = 'submitted'`,
      [villa.villaId, villa.membershipId],
    );

    // Approval queues are only meaningful to people who can act on them.
    const approvals = {
      expenseClaims: can(req, 'expenses:approve')
        ? queryOne<{ count: number; amount: number }>(
            `SELECT COUNT(*) AS count, COALESCE(SUM(amount_minor), 0) AS amount
               FROM expense_claims WHERE villa_id = ? AND status = 'submitted' AND membership_id != ?`,
            [villa.villaId, villa.membershipId],
          )
        : null,
      leaveRequests: can(req, 'leave:approve')
        ? queryOne<{ count: number }>(
            `SELECT COUNT(*) AS count FROM leave_requests
              WHERE villa_id = ? AND status = 'pending' AND membership_id != ?`,
            [villa.villaId, villa.membershipId],
          )
        : null,
      shiftSwaps: can(req, 'roster:swap.approve')
        ? queryOne<{ count: number }>(
            "SELECT COUNT(*) AS count FROM shift_swap_requests WHERE villa_id = ? AND status = 'pending'",
            [villa.villaId],
          )
        : null,
    };

    const teamToday = taskScope === 'all'
      ? {
          onShift: query<{ membership_id: string; full_name: string; starts_at: string; ends_at: string }>(
            `SELECT s.membership_id, u.full_name, s.starts_at, s.ends_at
               FROM shifts s JOIN memberships m ON m.id = s.membership_id JOIN users u ON u.id = m.user_id
              WHERE s.villa_id = ? AND s.status = 'published'
                AND date(s.starts_at) = ?
              ORDER BY s.starts_at`,
            [villa.villaId, day],
          ),
          onLeave: query<{ full_name: string; leave_type: string; end_date: string }>(
            `SELECT u.full_name, lt.name AS leave_type, lr.end_date
               FROM leave_requests lr
               JOIN memberships m ON m.id = lr.membership_id
               JOIN users u ON u.id = m.user_id
               JOIN leave_types lt ON lt.id = lr.leave_type_id
              WHERE lr.villa_id = ? AND lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?`,
            [villa.villaId, day, day],
          ),
          openTasks: queryOne<{ count: number }>(
            "SELECT COUNT(*) AS count FROM tasks WHERE villa_id = ? AND status IN ('todo', 'in_progress', 'blocked')",
            [villa.villaId],
          ),
          unassignedShifts: queryOne<{ count: number }>(
            `SELECT COUNT(*) AS count FROM shifts
              WHERE villa_id = ? AND membership_id IS NULL AND status = 'published' AND starts_at BETWEEN ? AND ?`,
            [villa.villaId, now, weekAhead],
          ),
        }
      : null;

    res.json({
      me: {
        openTasks: myOpenTasks?.count ?? 0,
        overdueTasks: myOverdueTasks?.count ?? 0,
        upcomingShifts: myShifts.map((shift) => ({
          id: shift.id,
          title: shift.title,
          startsAt: shift.starts_at,
          endsAt: shift.ends_at,
          location: shift.location,
        })),
        pendingClaims: myClaims?.pending ?? 0,
        pendingClaimAmountMinor: myClaims?.pending_amount ?? 0,
      },
      approvals: {
        expenseClaims: approvals.expenseClaims?.count ?? null,
        expenseClaimAmountMinor: approvals.expenseClaims?.amount ?? null,
        leaveRequests: approvals.leaveRequests?.count ?? null,
        shiftSwaps: approvals.shiftSwaps?.count ?? null,
      },
      team: teamToday
        ? {
            onShiftToday: teamToday.onShift.map((row) => ({
              membershipId: row.membership_id,
              fullName: row.full_name,
              startsAt: row.starts_at,
              endsAt: row.ends_at,
            })),
            onLeaveToday: teamToday.onLeave.map((row) => ({
              fullName: row.full_name,
              leaveType: row.leave_type,
              until: row.end_date,
            })),
            openTasks: teamToday.openTasks?.count ?? 0,
            unassignedShiftsThisWeek: teamToday.unassignedShifts?.count ?? 0,
          }
        : null,
      currency: villa.currency,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /reports/expenses — spend summary for a period
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/expenses',
  requirePermission('reports:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const { from, to } = parseQuery(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(`${new Date().getFullYear()}-01-01`),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(today(villa.timezone)),
      }),
      req,
    );

    const byCategory = query<{ name: string | null; colour: string | null; total: number; count: number }>(
      `SELECT c.name, c.colour, COALESCE(SUM(ec.amount_minor), 0) AS total, COUNT(*) AS count
         FROM expense_claims ec
         LEFT JOIN expense_categories c ON c.id = ec.category_id
        WHERE ec.villa_id = ? AND ec.spent_on BETWEEN ? AND ?
          AND ec.status IN ('approved', 'reimbursed')
        GROUP BY ec.category_id
        ORDER BY total DESC`,
      [villa.villaId, from, to],
    );
    const byStaff = query<{ full_name: string; total: number; count: number }>(
      `SELECT u.full_name, COALESCE(SUM(ec.amount_minor), 0) AS total, COUNT(*) AS count
         FROM expense_claims ec
         JOIN memberships m ON m.id = ec.membership_id
         JOIN users u ON u.id = m.user_id
        WHERE ec.villa_id = ? AND ec.spent_on BETWEEN ? AND ?
          AND ec.status IN ('approved', 'reimbursed')
        GROUP BY ec.membership_id
        ORDER BY total DESC`,
      [villa.villaId, from, to],
    );
    const byMonth = query<{ month: string; total: number }>(
      `SELECT substr(ec.spent_on, 1, 7) AS month, COALESCE(SUM(ec.amount_minor), 0) AS total
         FROM expense_claims ec
        WHERE ec.villa_id = ? AND ec.spent_on BETWEEN ? AND ?
          AND ec.status IN ('approved', 'reimbursed')
        GROUP BY month ORDER BY month`,
      [villa.villaId, from, to],
    );
    const outstanding = queryOne<{ count: number; total: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount_minor), 0) AS total
         FROM expense_claims WHERE villa_id = ? AND status = 'approved'`,
      [villa.villaId],
    );

    res.json({
      from,
      to,
      currency: villa.currency,
      byCategory: byCategory.map((row) => ({
        category: row.name ?? 'Uncategorised',
        colour: row.colour ?? '#94a3b8',
        totalMinor: row.total,
        claimCount: row.count,
      })),
      byStaff: byStaff.map((row) => ({ staffName: row.full_name, totalMinor: row.total, claimCount: row.count })),
      byMonth: byMonth.map((row) => ({ month: row.month, totalMinor: row.total })),
      awaitingReimbursement: {
        count: outstanding?.count ?? 0,
        totalMinor: outstanding?.total ?? 0,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /reports/hours — rostered hours per person, for payroll
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/hours',
  requirePermission('reports:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const { from, to } = parseQuery(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      req,
    );

    const rows = query<{
      membership_id: string; full_name: string; job_title: string | null;
      shift_count: number; total_minutes: number; pay_rate_minor: number | null; pay_period: string;
    }>(
      `SELECT s.membership_id, u.full_name, m.job_title, m.pay_rate_minor, m.pay_period,
              COUNT(*) AS shift_count,
              COALESCE(SUM((julianday(s.ends_at) - julianday(s.starts_at)) * 1440 - s.break_minutes), 0) AS total_minutes
         FROM shifts s
         JOIN memberships m ON m.id = s.membership_id
         JOIN users u ON u.id = m.user_id
        WHERE s.villa_id = ? AND s.status = 'published'
          AND date(s.starts_at) BETWEEN ? AND ?
        GROUP BY s.membership_id
        ORDER BY u.full_name`,
      [villa.villaId, from, to],
    );

    const includePay = can(req, 'members:view_sensitive');
    res.json({
      from,
      to,
      currency: villa.currency,
      rows: rows.map((row) => {
        const hours = Math.round((row.total_minutes / 60) * 100) / 100;
        return {
          membershipId: row.membership_id,
          staffName: row.full_name,
          jobTitle: row.job_title,
          shiftCount: row.shift_count,
          hours,
          // Only an hourly rate can be projected from rostered hours; salaried
          // staff are reported without an estimate rather than a wrong one.
          ...(includePay
            ? {
                payRateMinor: row.pay_rate_minor,
                payPeriod: row.pay_period,
                estimatedCostMinor:
                  row.pay_period === 'hour' && row.pay_rate_minor !== null
                    ? Math.round(hours * row.pay_rate_minor)
                    : null,
              }
            : {}),
        };
      }),
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /reports/leave — leave taken and remaining, per person
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/leave',
  requirePermission('reports:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const { year } = parseQuery(
      z.object({ year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()) }),
      req,
    );
    const rows = query<{
      membership_id: string; full_name: string; leave_type: string; colour: string;
      approved_days: number; pending_days: number;
    }>(
      `SELECT lr.membership_id, u.full_name, lt.name AS leave_type, lt.colour,
              COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN lr.total_days ELSE 0 END), 0) AS approved_days,
              COALESCE(SUM(CASE WHEN lr.status = 'pending'  THEN lr.total_days ELSE 0 END), 0) AS pending_days
         FROM leave_requests lr
         JOIN memberships m ON m.id = lr.membership_id
         JOIN users u ON u.id = m.user_id
         JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.villa_id = ? AND substr(lr.start_date, 1, 4) = ?
        GROUP BY lr.membership_id, lr.leave_type_id
        ORDER BY u.full_name, lt.name`,
      [villa.villaId, String(year)],
    );
    res.json({
      year,
      rows: rows.map((row) => ({
        membershipId: row.membership_id,
        staffName: row.full_name,
        leaveType: row.leave_type,
        colour: row.colour,
        approvedDays: row.approved_days,
        pendingDays: row.pending_days,
      })),
    });
  }),
);
