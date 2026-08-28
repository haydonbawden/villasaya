import { Router } from 'express';
import { z } from 'zod';
import { execute, nextReference, query, queryOne, transaction } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { accessScope, can, requireAuth, requireVilla } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, forbidden, notFound } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { notify } from '../lib/notify.ts';
import { isoDateTimeSchema, parseBody, parseQuery } from '../lib/validate.ts';
import { emitToVilla } from '../realtime/hub.ts';

export const tasksRouter = Router({ mergeParams: true });

type TaskRow = {
  id: string;
  reference: number;
  title: string;
  description: string | null;
  location: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  recurrence: string | null;
  category_id: string | null;
  category_name: string | null;
  category_colour: string | null;
  created_by: string;
  creator_name: string;
  completed_at: string | null;
  completed_by_name: string | null;
  created_at: string;
  updated_at: string;
};

const TASK_SELECT = `
  SELECT t.id, t.reference, t.title, t.description, t.location, t.priority, t.status, t.due_at,
         t.recurrence, t.category_id, t.created_by, t.completed_at, t.created_at, t.updated_at,
         c.name AS category_name, c.colour AS category_colour,
         cu.full_name AS creator_name,
         du.full_name AS completed_by_name
    FROM tasks t
    LEFT JOIN task_categories c ON c.id = t.category_id
    JOIN users cu ON cu.id = t.created_by
    LEFT JOIN users du ON du.id = t.completed_by`;

function assigneesFor(taskIds: string[]): Map<string, Array<{ membershipId: string; fullName: string; avatarColour: string }>> {
  const map = new Map<string, Array<{ membershipId: string; fullName: string; avatarColour: string }>>();
  if (taskIds.length === 0) return map;
  const placeholders = taskIds.map(() => '?').join(', ');
  const rows = query<{ task_id: string; membership_id: string; full_name: string; avatar_colour: string }>(
    `SELECT ta.task_id, ta.membership_id, u.full_name, u.avatar_colour
       FROM task_assignees ta
       JOIN memberships m ON m.id = ta.membership_id
       JOIN users u ON u.id = m.user_id
      WHERE ta.task_id IN (${placeholders})`,
    taskIds,
  );
  for (const row of rows) {
    const list = map.get(row.task_id) ?? [];
    list.push({ membershipId: row.membership_id, fullName: row.full_name, avatarColour: row.avatar_colour });
    map.set(row.task_id, list);
  }
  return map;
}

function serialise(row: TaskRow, assignees: Array<{ membershipId: string; fullName: string; avatarColour: string }>) {
  return {
    id: row.id,
    reference: `TASK-${row.reference}`,
    title: row.title,
    description: row.description,
    location: row.location,
    priority: row.priority,
    status: row.status,
    dueAt: row.due_at,
    recurrence: row.recurrence,
    category: row.category_id
      ? { id: row.category_id, name: row.category_name, colour: row.category_colour }
      : null,
    assignees,
    createdBy: row.creator_name,
    completedAt: row.completed_at,
    completedBy: row.completed_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadTask(villaId: string, taskId: string): TaskRow {
  const row = queryOne<TaskRow>(`${TASK_SELECT} WHERE t.villa_id = ? AND t.id = ?`, [villaId, taskId]);
  if (!row) throw notFound('Task not found');
  return row;
}

function isAssignee(taskId: string, membershipId: string): boolean {
  return Boolean(
    queryOne('SELECT 1 AS ok FROM task_assignees WHERE task_id = ? AND membership_id = ?', [taskId, membershipId]),
  );
}

/** Assignee ids, used to notify everyone attached to a task. */
function assigneeIds(taskId: string): string[] {
  return query<{ membership_id: string }>('SELECT membership_id FROM task_assignees WHERE task_id = ?', [
    taskId,
  ]).map((row) => row.membership_id);
}

// ---------------------------------------------------------------------------
// GET /tasks
// ---------------------------------------------------------------------------
tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const scope = accessScope(req, 'tasks');
    if (scope === 'none') throw forbidden('You do not have permission to view tasks');

    const filters = parseQuery(
      z.object({
        status: z.string().trim().optional(),
        assignee: z.string().trim().optional(),
        categoryId: z.string().trim().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        dueBefore: z.string().trim().optional(),
        search: z.string().trim().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      req,
    );

    const where: string[] = ['t.villa_id = ?'];
    const params: (string | number)[] = [villa.villaId];

    // A member limited to `tasks:view.own` only ever sees rows they are on,
    // whatever the assignee filter asks for.
    if (scope === 'own') {
      where.push('EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.membership_id = ?)');
      params.push(villa.membershipId);
    } else if (filters.assignee) {
      if (filters.assignee === 'unassigned') {
        where.push('NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id)');
      } else {
        where.push('EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.membership_id = ?)');
        params.push(filters.assignee);
      }
    }
    if (filters.status) {
      const statuses = filters.status.split(',').map((value) => value.trim()).filter(Boolean);
      if (statuses.length > 0) {
        where.push(`t.status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      }
    }
    if (filters.categoryId) { where.push('t.category_id = ?'); params.push(filters.categoryId); }
    if (filters.priority) { where.push('t.priority = ?'); params.push(filters.priority); }
    if (filters.dueBefore) { where.push('t.due_at IS NOT NULL AND t.due_at <= ?'); params.push(filters.dueBefore); }
    if (filters.search) {
      where.push('(t.title LIKE ? OR t.description LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const rows = query<TaskRow>(
      `${TASK_SELECT}
        WHERE ${where.join(' AND ')}
        ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
                 CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                 COALESCE(t.due_at, '9999') ASC
        LIMIT ?`,
      [...params, filters.limit],
    );
    const assignees = assigneesFor(rows.map((row) => row.id));
    res.json({ tasks: rows.map((row) => serialise(row, assignees.get(row.id) ?? [])) });
  }),
);

// ---------------------------------------------------------------------------
// GET /tasks/categories
// ---------------------------------------------------------------------------
tasksRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const rows = query<{ id: string; name: string; colour: string }>(
      'SELECT id, name, colour FROM task_categories WHERE villa_id = ? ORDER BY name',
      [villa.villaId],
    );
    res.json({ categories: rows });
  }),
);

tasksRouter.post(
  '/categories',
  requirePermission('tasks:create'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({ name: z.string().trim().min(2).max(60), colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0ea5e9') }),
      req,
    );
    const id = newId();
    execute('INSERT INTO task_categories (id, villa_id, name, colour, created_at) VALUES (?, ?, ?, ?, ?)', [
      id, villa.villaId, input.name, input.colour, new Date().toISOString(),
    ]);
    res.status(201).json({ category: { id, name: input.name, colour: input.colour } });
  }),
);

// ---------------------------------------------------------------------------
// POST /tasks
// ---------------------------------------------------------------------------
const taskBodySchema = z.object({
  title: z.string().trim().min(2, 'Give the task a title').max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  categoryId: z.string().trim().nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueAt: isoDateTimeSchema.nullable().optional(),
  recurrence: z
    .string()
    .trim()
    .regex(/^(daily|weekly:[0-6](,[0-6])*|monthly:([1-9]|[12][0-9]|3[01]))$/, 'Unsupported recurrence')
    .nullable()
    .optional(),
  assigneeIds: z.array(z.string().trim()).max(20).default([]),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

tasksRouter.post(
  '/',
  requirePermission('tasks:create'),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const input = parseBody(taskBodySchema, req);

    if (input.assigneeIds.length > 0 && !can(req, 'tasks:assign')) {
      // Without the assign permission a member may still create a task, but
      // only for themselves.
      const onlySelf = input.assigneeIds.every((id) => id === villa.membershipId);
      if (!onlySelf) throw forbidden('You can only assign tasks to yourself');
    }
    assertMembershipsExist(villa.villaId, input.assigneeIds);
    if (input.categoryId) assertCategoryExists(villa.villaId, input.categoryId);

    const now = new Date().toISOString();
    const taskId = newId();
    transaction(() => {
      const reference = nextReference('tasks', villa.villaId);
      execute(
        `INSERT INTO tasks (id, villa_id, reference, title, description, category_id, location, priority, status, due_at, recurrence, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)`,
        [taskId, villa.villaId, reference, input.title, input.description ?? null, input.categoryId ?? null,
         input.location ?? null, input.priority, input.dueAt ?? null, input.recurrence ?? null, auth.userId, now, now],
      );
      for (const membershipId of new Set(input.assigneeIds)) {
        execute(
          'INSERT INTO task_assignees (task_id, membership_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?)',
          [taskId, membershipId, now, auth.userId],
        );
      }
      input.checklist.forEach((label, index) => {
        execute(
          'INSERT INTO task_checklist_items (id, task_id, label, position, created_at) VALUES (?, ?, ?, ?, ?)',
          [newId(), taskId, label, index, now],
        );
      });
    });

    notify({
      villaId: villa.villaId,
      membershipIds: input.assigneeIds,
      actorMembershipId: villa.membershipId,
      kind: 'task.assigned',
      title: 'New task assigned to you',
      body: input.title,
      link: `/villas/${villa.villaId}/tasks/${taskId}`,
      payload: { taskId },
    });
    auditFromRequest(req, {
      action: 'task.created',
      entityType: 'task',
      entityId: taskId,
      summary: `Task "${input.title}" created`,
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'tasks' } });

    const row = loadTask(villa.villaId, taskId);
    res.status(201).json({ task: serialise(row, assigneesFor([taskId]).get(taskId) ?? []) });
  }),
);

function assertMembershipsExist(villaId: string, membershipIds: string[]): void {
  for (const membershipId of new Set(membershipIds)) {
    const exists = queryOne(
      "SELECT 1 AS ok FROM memberships WHERE id = ? AND villa_id = ? AND status = 'active'",
      [membershipId, villaId],
    );
    if (!exists) throw badRequest('One of the people you selected is not an active member of this villa');
  }
}

function assertCategoryExists(villaId: string, categoryId: string): void {
  const exists = queryOne('SELECT 1 AS ok FROM task_categories WHERE id = ? AND villa_id = ?', [categoryId, villaId]);
  if (!exists) throw badRequest('That task category does not exist');
}

// ---------------------------------------------------------------------------
// GET /tasks/:taskId
// ---------------------------------------------------------------------------
tasksRouter.get(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const scope = accessScope(req, 'tasks');
    if (scope === 'none') throw forbidden('You do not have permission to view tasks');
    const taskId = String(req.params.taskId);
    const row = loadTask(villa.villaId, taskId);
    if (scope === 'own' && !isAssignee(taskId, villa.membershipId)) {
      throw notFound('Task not found');
    }

    const checklist = query<{ id: string; label: string; is_done: number; position: number }>(
      'SELECT id, label, is_done, position FROM task_checklist_items WHERE task_id = ? ORDER BY position',
      [taskId],
    );
    const comments = query<{ id: string; body: string; created_at: string; author: string; avatar_colour: string }>(
      `SELECT c.id, c.body, c.created_at, u.full_name AS author, u.avatar_colour
         FROM task_comments c JOIN users u ON u.id = c.author_id
        WHERE c.task_id = ? ORDER BY c.created_at`,
      [taskId],
    );
    res.json({
      task: serialise(row, assigneesFor([taskId]).get(taskId) ?? []),
      checklist: checklist.map((item) => ({ id: item.id, label: item.label, isDone: item.is_done === 1, position: item.position })),
      comments,
    });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /tasks/:taskId
// ---------------------------------------------------------------------------
tasksRouter.patch(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const taskId = String(req.params.taskId);
    const task = loadTask(villa.villaId, taskId);

    const canEditAll = can(req, 'tasks:update.all');
    const canEditOwn = can(req, 'tasks:update.own') && isAssignee(taskId, villa.membershipId);
    if (!canEditAll && !canEditOwn) throw forbidden('You cannot edit this task');

    const input = parseBody(taskBodySchema.partial().extend({
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
    }), req);

    // Someone with only `tasks:update.own` can move their task along and note
    // progress, but not rewrite what the task is or who it belongs to.
    if (!canEditAll) {
      const restricted = ['title', 'description', 'categoryId', 'priority', 'dueAt', 'recurrence', 'assigneeIds', 'location'] as const;
      const attempted = restricted.filter((field) => input[field] !== undefined);
      if (attempted.length > 0) {
        throw forbidden('You can update the status of your task, but not its details', { fields: attempted });
      }
    }
    if (input.assigneeIds !== undefined && !can(req, 'tasks:assign')) {
      throw forbidden('You do not have permission to assign tasks');
    }
    if (input.assigneeIds) assertMembershipsExist(villa.villaId, input.assigneeIds);
    if (input.categoryId) assertCategoryExists(villa.villaId, input.categoryId);

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => { updates.push(`${column} = ?`); params.push(value); };

    if (input.title !== undefined) set('title', input.title);
    if (input.description !== undefined) set('description', input.description);
    if (input.categoryId !== undefined) set('category_id', input.categoryId);
    if (input.location !== undefined) set('location', input.location);
    if (input.priority !== undefined) set('priority', input.priority);
    if (input.dueAt !== undefined) set('due_at', input.dueAt);
    if (input.recurrence !== undefined) set('recurrence', input.recurrence);
    if (input.status !== undefined) {
      set('status', input.status);
      if (input.status === 'done') {
        set('completed_at', now);
        set('completed_by', auth.userId);
      } else if (task.status === 'done') {
        // Re-opening a completed task clears the completion stamp.
        set('completed_at', null);
        set('completed_by', null);
      }
    }

    transaction(() => {
      if (updates.length > 0) {
        set('updated_at', now);
        execute(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, [...params, taskId]);
      }
      if (input.assigneeIds !== undefined) {
        execute('DELETE FROM task_assignees WHERE task_id = ?', [taskId]);
        for (const membershipId of new Set(input.assigneeIds)) {
          execute(
            'INSERT INTO task_assignees (task_id, membership_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?)',
            [taskId, membershipId, now, auth.userId],
          );
        }
      }
    });

    if (input.assigneeIds !== undefined) {
      notify({
        villaId: villa.villaId,
        membershipIds: input.assigneeIds,
        actorMembershipId: villa.membershipId,
        kind: 'task.assigned',
        title: 'A task was assigned to you',
        body: input.title ?? task.title,
        link: `/villas/${villa.villaId}/tasks/${taskId}`,
        payload: { taskId },
      });
    }
    if (input.status === 'done') {
      notify({
        villaId: villa.villaId,
        membershipIds: assigneeIds(taskId),
        actorMembershipId: villa.membershipId,
        kind: 'task.completed',
        title: 'Task completed',
        body: task.title,
        link: `/villas/${villa.villaId}/tasks/${taskId}`,
        payload: { taskId },
      });
    }
    auditFromRequest(req, {
      action: 'task.updated',
      entityType: 'task',
      entityId: taskId,
      summary: `Task "${task.title}" updated`,
      metadata: input as Record<string, unknown>,
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'tasks' } });

    const updated = loadTask(villa.villaId, taskId);
    res.json({ task: serialise(updated, assigneesFor([taskId]).get(taskId) ?? []) });
  }),
);

// ---------------------------------------------------------------------------
// Checklist and comments
// ---------------------------------------------------------------------------
tasksRouter.patch(
  '/:taskId/checklist/:itemId',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const taskId = String(req.params.taskId);
    loadTask(villa.villaId, taskId);
    const allowed = can(req, 'tasks:update.all') || (can(req, 'tasks:update.own') && isAssignee(taskId, villa.membershipId));
    if (!allowed) throw forbidden('You cannot update this checklist');

    const input = parseBody(z.object({ isDone: z.boolean() }), req);
    const changed = execute('UPDATE task_checklist_items SET is_done = ? WHERE id = ? AND task_id = ?', [
      input.isDone, String(req.params.itemId), taskId,
    ]);
    if (changed.changes === 0) throw notFound('Checklist item not found');
    res.json({ updated: true });
  }),
);

tasksRouter.post(
  '/:taskId/comments',
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const taskId = String(req.params.taskId);
    const task = loadTask(villa.villaId, taskId);
    const scope = accessScope(req, 'tasks');
    if (scope === 'none' || (scope === 'own' && !isAssignee(taskId, villa.membershipId))) {
      throw forbidden('You cannot comment on this task');
    }

    const input = parseBody(z.object({ body: z.string().trim().min(1).max(2000) }), req);
    const commentId = newId();
    execute('INSERT INTO task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [
      commentId, taskId, auth.userId, input.body, new Date().toISOString(),
    ]);
    notify({
      villaId: villa.villaId,
      membershipIds: assigneeIds(taskId),
      actorMembershipId: villa.membershipId,
      kind: 'task.commented',
      title: `New comment on ${task.title}`,
      body: input.body.slice(0, 140),
      link: `/villas/${villa.villaId}/tasks/${taskId}`,
      payload: { taskId },
    });
    res.status(201).json({ comment: { id: commentId, body: input.body, author: auth.fullName, createdAt: new Date().toISOString() } });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /tasks/:taskId
// ---------------------------------------------------------------------------
tasksRouter.delete(
  '/:taskId',
  requirePermission('tasks:delete'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const task = loadTask(villa.villaId, String(req.params.taskId));
    execute('DELETE FROM tasks WHERE id = ? AND villa_id = ?', [task.id, villa.villaId]);
    auditFromRequest(req, {
      action: 'task.deleted',
      entityType: 'task',
      entityId: task.id,
      summary: `Task "${task.title}" deleted`,
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'tasks' } });
    res.status(204).end();
  }),
);
