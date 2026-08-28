import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, transaction } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { requireVilla } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { colourSchema, parseBody } from '../lib/validate.ts';
import { PERMISSION_KEYS, isPermissionKey, parsePermissionList } from '../permissions.ts';

export const rolesRouter = Router({ mergeParams: true });

const permissionListSchema = z
  .array(z.string())
  .max(PERMISSION_KEYS.length)
  .refine((keys) => keys.every(isPermissionKey), {
    message: 'One or more permissions are not recognised',
  })
  .transform((keys) => [...new Set(keys)]);

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  colour: string;
  permissions: string;
  is_system: number;
  is_owner: number;
  rank: number;
  member_count: number;
};

function serialiseRole(row: RoleRow) {
  const permissions = parsePermissionList(row.permissions);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    colour: row.colour,
    // The owner role carries a wildcard; the UI shows it as "everything" rather
    // than as a matrix of checked boxes.
    permissions: permissions.includes('*') ? [...PERMISSION_KEYS] : permissions,
    isSystem: row.is_system === 1,
    isOwner: row.is_owner === 1,
    rank: row.rank,
    memberCount: row.member_count,
  };
}

function loadRole(villaId: string, roleId: string): RoleRow {
  const row = queryOne<RoleRow>(
    `SELECT r.id, r.key, r.name, r.description, r.colour, r.permissions, r.is_system, r.is_owner, r.rank,
            (SELECT COUNT(*) FROM memberships m WHERE m.role_id = r.id AND m.status = 'active') AS member_count
       FROM roles r WHERE r.villa_id = ? AND r.id = ?`,
    [villaId, roleId],
  );
  if (!row) throw notFound('Role not found');
  return row;
}

// ---------------------------------------------------------------------------
// GET /roles
// ---------------------------------------------------------------------------
rolesRouter.get(
  '/',
  requirePermission('members:view'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const rows = query<RoleRow>(
      `SELECT r.id, r.key, r.name, r.description, r.colour, r.permissions, r.is_system, r.is_owner, r.rank,
              (SELECT COUNT(*) FROM memberships m WHERE m.role_id = r.id AND m.status = 'active') AS member_count
         FROM roles r WHERE r.villa_id = ? ORDER BY r.rank, r.name`,
      [villa.villaId],
    );
    res.json({ roles: rows.map(serialiseRole) });
  }),
);

// ---------------------------------------------------------------------------
// POST /roles — owner-defined role with an arbitrary permission set
// ---------------------------------------------------------------------------
rolesRouter.post(
  '/',
  requirePermission('roles:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2, 'Give the role a name').max(60),
        description: z.string().trim().max(300).optional(),
        colour: colourSchema.default('#64748b'),
        permissions: permissionListSchema.default([]),
        /** Optional: start from an existing role's permissions. */
        copyFromRoleId: z.string().trim().optional(),
      }),
      req,
    );

    const key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!key) throw badRequest('Role name must contain letters or numbers');
    if (queryOne('SELECT id FROM roles WHERE villa_id = ? AND key = ?', [villa.villaId, key])) {
      throw conflict('A role with that name already exists');
    }

    let permissions = input.permissions;
    if (input.copyFromRoleId) {
      const source = loadRole(villa.villaId, input.copyFromRoleId);
      const sourcePermissions = parsePermissionList(source.permissions);
      // Copying the owner role yields every concrete permission, never the
      // wildcard: only the seeded owner role may hold it.
      permissions = sourcePermissions.includes('*') ? [...PERMISSION_KEYS] : sourcePermissions;
    }

    const now = new Date().toISOString();
    const roleId = newId();
    execute(
      `INSERT INTO roles (id, villa_id, key, name, description, colour, permissions, is_system, is_owner, rank, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [roleId, villa.villaId, key, input.name, input.description ?? null, input.colour, JSON.stringify(permissions), 50, now, now],
    );
    auditFromRequest(req, {
      action: 'role.created',
      entityType: 'role',
      entityId: roleId,
      summary: `Role "${input.name}" created`,
      metadata: { permissions },
    });
    res.status(201).json({ role: serialiseRole(loadRole(villa.villaId, roleId)) });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /roles/:roleId — this is the permission matrix editor's save endpoint
// ---------------------------------------------------------------------------
rolesRouter.patch(
  '/:roleId',
  requirePermission('roles:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const role = loadRole(villa.villaId, String(req.params.roleId));
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(60).optional(),
        description: z.string().trim().max(300).nullable().optional(),
        colour: colourSchema.optional(),
        permissions: permissionListSchema.optional(),
      }),
      req,
    );

    // The owner role is the recovery path out of a misconfigured workspace, so
    // its permissions stay fixed even though it can be renamed.
    if (role.is_owner === 1 && input.permissions !== undefined) {
      throw forbidden("The owner role always has every permission and cannot be narrowed");
    }
    if (role.is_owner === 1 && !villa.isOwner) {
      throw forbidden('Only the owner can edit the owner role');
    }

    const updates: string[] = [];
    const params: (string | null)[] = [];
    if (input.name !== undefined) { updates.push('name = ?'); params.push(input.name); }
    if (input.description !== undefined) { updates.push('description = ?'); params.push(input.description); }
    if (input.colour !== undefined) { updates.push('colour = ?'); params.push(input.colour); }
    if (input.permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(input.permissions));
    }
    if (updates.length === 0) {
      res.json({ role: serialiseRole(role) });
      return;
    }
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    execute(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`, [...params, role.id]);

    auditFromRequest(req, {
      action: 'role.updated',
      entityType: 'role',
      entityId: role.id,
      summary: `Role "${input.name ?? role.name}" updated`,
      metadata: input.permissions
        ? { added: diff(input.permissions, parsePermissionList(role.permissions)),
            removed: diff(parsePermissionList(role.permissions), input.permissions) }
        : {},
    });
    res.json({ role: serialiseRole(loadRole(villa.villaId, role.id)) });
  }),
);

function diff(a: string[], b: string[]): string[] {
  const other = new Set(b);
  return a.filter((value) => !other.has(value));
}

// ---------------------------------------------------------------------------
// DELETE /roles/:roleId — members must be moved to another role first
// ---------------------------------------------------------------------------
rolesRouter.delete(
  '/:roleId',
  requirePermission('roles:manage'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const role = loadRole(villa.villaId, String(req.params.roleId));
    if (role.is_system === 1) throw forbidden('Built-in roles cannot be deleted');

    const input = parseBody(
      z.object({ reassignToRoleId: z.string().trim().optional() }),
      req,
    );

    if (role.member_count > 0) {
      if (!input.reassignToRoleId) {
        throw conflict(
          `${role.member_count} staff member${role.member_count === 1 ? '' : 's'} still hold this role. ` +
            'Choose a role to move them to.',
          { memberCount: role.member_count },
        );
      }
      const target = loadRole(villa.villaId, input.reassignToRoleId);
      if (target.id === role.id) throw badRequest('Choose a different role to move staff to');
      if (target.is_owner === 1) throw forbidden('Staff cannot be reassigned into the owner role');
      transaction(() => {
        execute('UPDATE memberships SET role_id = ?, updated_at = ? WHERE villa_id = ? AND role_id = ?', [
          target.id,
          new Date().toISOString(),
          villa.villaId,
          role.id,
        ]);
        execute('DELETE FROM roles WHERE id = ?', [role.id]);
      });
    } else {
      execute('DELETE FROM roles WHERE id = ?', [role.id]);
    }

    auditFromRequest(req, {
      action: 'role.deleted',
      entityType: 'role',
      entityId: role.id,
      summary: `Role "${role.name}" deleted`,
      metadata: { reassignedTo: input.reassignToRoleId ?? null, movedMembers: role.member_count },
    });
    res.status(204).end();
  }),
);
