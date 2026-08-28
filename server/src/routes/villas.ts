import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, transaction } from '../db/index.ts';
import { asyncHandler, authenticate, requirePermission, withVilla } from '../auth/middleware.ts';
import { requireAuth, requireVilla } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { forbidden, notFound } from '../lib/errors.ts';
import { parseBody, parseQuery } from '../lib/validate.ts';
import { PERMISSIONS, PERMISSION_GROUPS } from '../permissions.ts';
import { createVillaWorkspace } from '../services/villas.ts';
import { refreshVillaAccess } from '../realtime/hub.ts';
import { rolesRouter } from './roles.ts';
import { membersRouter } from './members.ts';
import { invitationsRouter } from './invitations.ts';
import { tasksRouter } from './tasks.ts';
import { rosterRouter } from './roster.ts';
import { leaveRouter } from './leave.ts';
import { expensesRouter } from './expenses.ts';
import { messagesRouter } from './messages.ts';
import { filesRouter } from './files.ts';
import { notificationsRouter } from './notifications.ts';
import { reportsRouter } from './reports.ts';

export const villasRouter = Router();

villasRouter.use(authenticate);

// ---------------------------------------------------------------------------
// GET /api/villas — workspaces the caller belongs to
// ---------------------------------------------------------------------------
villasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const rows = query<{
      id: string;
      name: string;
      slug: string;
      address: string | null;
      timezone: string;
      currency: string;
      role_key: string;
      role_name: string;
      is_owner: number;
      membership_id: string;
      member_count: number;
    }>(
      `SELECT v.id, v.name, v.slug, v.address, v.timezone, v.currency,
              r.key AS role_key, r.name AS role_name, r.is_owner,
              m.id  AS membership_id,
              (SELECT COUNT(*) FROM memberships mm
                WHERE mm.villa_id = v.id AND mm.status = 'active') AS member_count
         FROM memberships m
         JOIN villas v ON v.id = m.villa_id
         JOIN roles  r ON r.id = m.role_id
        WHERE m.user_id = ? AND m.status = 'active' AND v.archived_at IS NULL
        ORDER BY r.is_owner DESC, v.name`,
      [auth.userId],
    );
    res.json({
      villas: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        address: row.address,
        timezone: row.timezone,
        currency: row.currency,
        membershipId: row.membership_id,
        memberCount: row.member_count,
        role: { key: row.role_key, name: row.role_name, isOwner: row.is_owner === 1 },
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/villas — create a workspace; the creator becomes its owner
// ---------------------------------------------------------------------------
villasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2, 'Give the villa a name').max(120),
        address: z.string().trim().max(300).optional(),
        timezone: z.string().trim().max(64).default('Asia/Makassar'),
        currency: z.string().trim().length(3).default('IDR'),
      }),
      req,
    );
    const created = createVillaWorkspace({
      name: input.name,
      ownerUserId: auth.userId,
      address: input.address ?? null,
      timezone: input.timezone,
      currency: input.currency.toUpperCase(),
    });
    auditFromRequest(req, {
      villaId: created.villaId,
      action: 'villa.created',
      entityType: 'villa',
      entityId: created.villaId,
      summary: `${auth.fullName} created ${input.name}`,
    });
    refreshVillaAccess(auth.userId);
    res.status(201).json({
      villa: {
        id: created.villaId,
        name: input.name,
        slug: created.slug,
        timezone: input.timezone,
        currency: input.currency.toUpperCase(),
      },
      membershipId: created.ownerMembershipId,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/villas/permissions — catalogue backing the permission matrix editor
// ---------------------------------------------------------------------------
villasRouter.get('/permissions', (_req, res) => {
  res.json({
    groups: PERMISSION_GROUPS,
    permissions: PERMISSIONS,
  });
});

// Everything below is tenant-scoped.
villasRouter.use('/:villaId', withVilla);

// ---------------------------------------------------------------------------
// GET /api/villas/:villaId
// ---------------------------------------------------------------------------
villasRouter.get(
  '/:villaId',
  requirePermission('villa:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const row = queryOne<{
      id: string;
      name: string;
      slug: string;
      address: string | null;
      timezone: string;
      currency: string;
      week_starts_on: number;
      created_at: string;
    }>(
      'SELECT id, name, slug, address, timezone, currency, week_starts_on, created_at FROM villas WHERE id = ?',
      [villa.villaId],
    );
    if (!row) throw notFound('Villa not found');
    res.json({
      villa: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        address: row.address,
        timezone: row.timezone,
        currency: row.currency,
        weekStartsOn: row.week_starts_on,
        createdAt: row.created_at,
      },
      me: {
        membershipId: villa.membershipId,
        role: { id: villa.roleId, key: villa.roleKey, name: villa.roleName, isOwner: villa.isOwner },
        permissions: [...villa.permissions].filter((key) => key !== '*'),
        isOwner: villa.isOwner,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/villas/:villaId
// ---------------------------------------------------------------------------
villasRouter.patch(
  '/:villaId',
  requirePermission('villa:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(120).optional(),
        address: z.string().trim().max(300).nullable().optional(),
        timezone: z.string().trim().max(64).optional(),
        currency: z.string().trim().length(3).optional(),
        weekStartsOn: z.number().int().min(0).max(6).optional(),
      }),
      req,
    );
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    if (input.name !== undefined) { updates.push('name = ?'); params.push(input.name); }
    if (input.address !== undefined) { updates.push('address = ?'); params.push(input.address); }
    if (input.timezone !== undefined) { updates.push('timezone = ?'); params.push(input.timezone); }
    if (input.currency !== undefined) { updates.push('currency = ?'); params.push(input.currency.toUpperCase()); }
    if (input.weekStartsOn !== undefined) { updates.push('week_starts_on = ?'); params.push(input.weekStartsOn); }
    if (updates.length === 0) {
      res.status(200).json({ updated: false });
      return;
    }
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    execute(`UPDATE villas SET ${updates.join(', ')} WHERE id = ?`, [...params, villa.villaId]);
    auditFromRequest(req, {
      action: 'villa.updated',
      entityType: 'villa',
      entityId: villa.villaId,
      metadata: input as Record<string, unknown>,
    });
    res.json({ updated: true });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/villas/:villaId — owner only, and only with the name typed back
// ---------------------------------------------------------------------------
villasRouter.delete(
  '/:villaId',
  requirePermission('villa:delete'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    if (!villa.isOwner) throw forbidden('Only the villa owner can delete the workspace');
    const input = parseBody(z.object({ confirmName: z.string() }), req);
    if (input.confirmName.trim() !== villa.villaName) {
      throw forbidden('Type the villa name exactly to confirm deletion');
    }
    // Audited before the delete, because the audit rows cascade away with it.
    auditFromRequest(req, {
      action: 'villa.deleted',
      entityType: 'villa',
      entityId: villa.villaId,
      summary: `${villa.villaName} was deleted`,
    });
    transaction(() => {
      execute('DELETE FROM villas WHERE id = ?', [villa.villaId]);
    });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// GET /api/villas/:villaId/audit
// ---------------------------------------------------------------------------
villasRouter.get(
  '/:villaId/audit',
  requirePermission('audit:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const { limit, cursor } = parseQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        cursor: z.string().trim().max(64).optional(),
      }),
      req,
    );
    const rows = query<{
      id: string;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      summary: string | null;
      metadata: string;
      created_at: string;
      actor_name: string | null;
    }>(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.metadata, a.created_at,
              u.full_name AS actor_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.villa_id = ? ${cursor ? 'AND a.id < ?' : ''}
        ORDER BY a.id DESC
        LIMIT ?`,
      cursor ? [villa.villaId, cursor, limit + 1] : [villa.villaId, limit + 1],
    );
    const page = rows.slice(0, limit);
    res.json({
      entries: page.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        summary: row.summary,
        metadata: JSON.parse(row.metadata) as unknown,
        actorName: row.actor_name,
        createdAt: row.created_at,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
    });
  }),
);

villasRouter.use('/:villaId/roles', rolesRouter);
villasRouter.use('/:villaId/members', membersRouter);
villasRouter.use('/:villaId/invitations', invitationsRouter);
villasRouter.use('/:villaId/tasks', tasksRouter);
villasRouter.use('/:villaId/roster', rosterRouter);
villasRouter.use('/:villaId/leave', leaveRouter);
villasRouter.use('/:villaId/expenses', expensesRouter);
villasRouter.use('/:villaId/messages', messagesRouter);
villasRouter.use('/:villaId/files', filesRouter);
villasRouter.use('/:villaId/notifications', notificationsRouter);
villasRouter.use('/:villaId/reports', reportsRouter);
