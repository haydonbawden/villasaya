import type { Request } from 'express';
import { queryOne } from '../db/index.ts';
import { forbidden, unauthorised } from '../lib/errors.ts';
import {
  hasPermission,
  parseOverrides,
  parsePermissionList,
  resolvePermissions,
  scopeFor,
  type AccessScope,
  type PermissionKey,
} from '../permissions.ts';

export type RequestAuth = {
  userId: string;
  email: string;
  fullName: string;
  sessionFamily: string;
};

export type RequestVillaContext = {
  villaId: string;
  villaName: string;
  timezone: string;
  currency: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isOwner: boolean;
  permissions: Set<PermissionKey>;
};

type MembershipRow = {
  membership_id: string;
  membership_status: string;
  permission_overrides: string;
  role_id: string;
  role_key: string;
  role_name: string;
  role_permissions: string;
  is_owner: number;
  villa_id: string;
  villa_name: string;
  timezone: string;
  currency: string;
  archived_at: string | null;
};

/**
 * Resolves a user's standing in one villa. Returns null when the user has no
 * membership, so callers can decide between 404 (do not leak existence) and
 * 403 — routes use 404 for an unknown villa id and 403 for a suspended member.
 */
export function loadVillaContext(userId: string, villaId: string): RequestVillaContext | null {
  const row = queryOne<MembershipRow>(
    `SELECT m.id                   AS membership_id,
            m.status               AS membership_status,
            m.permission_overrides AS permission_overrides,
            r.id                   AS role_id,
            r.key                  AS role_key,
            r.name                 AS role_name,
            r.permissions          AS role_permissions,
            r.is_owner             AS is_owner,
            v.id                   AS villa_id,
            v.name                 AS villa_name,
            v.timezone             AS timezone,
            v.currency             AS currency,
            v.archived_at          AS archived_at
       FROM memberships m
       JOIN roles  r ON r.id = m.role_id
       JOIN villas v ON v.id = m.villa_id
      WHERE m.user_id = ? AND m.villa_id = ?`,
    [userId, villaId],
  );
  if (!row) return null;
  if (row.archived_at) return null;
  // A removed member is treated as never having been here, so the villa reads
  // as missing. A suspended member gets a distinct answer, because being told
  // "your access is suspended" is what lets them go and ask about it.
  if (row.membership_status === 'removed') return null;
  if (row.membership_status !== 'active') {
    throw forbidden('Your access to this villa has been suspended');
  }

  return {
    villaId: row.villa_id,
    villaName: row.villa_name,
    timezone: row.timezone,
    currency: row.currency,
    membershipId: row.membership_id,
    roleId: row.role_id,
    roleKey: row.role_key,
    roleName: row.role_name,
    isOwner: row.is_owner === 1,
    permissions: resolveEffective(row.role_permissions, row.permission_overrides),
  };
}

export function resolveEffective(rolePermissionsJson: string, overridesJson: string): Set<PermissionKey> {
  return resolvePermissions(parsePermissionList(rolePermissionsJson), parseOverrides(overridesJson));
}

export function requireAuth(req: Request): RequestAuth {
  if (!req.auth) throw unauthorised();
  return req.auth;
}

export function requireVilla(req: Request): RequestVillaContext {
  if (!req.villa) throw unauthorised('Villa context missing');
  return req.villa;
}

export function can(req: Request, permission: PermissionKey): boolean {
  const villa = req.villa;
  if (!villa) return false;
  return hasPermission(villa.permissions, permission);
}

export function assertCan(req: Request, permission: PermissionKey): void {
  if (!can(req, permission)) {
    throw forbidden(`This action requires the "${permission}" permission`, { permission });
  }
}

/** Widest scope the caller holds for a `.all` / `.own` permission pair. */
export function accessScope(req: Request, resource: string, action = 'view'): AccessScope {
  const villa = req.villa;
  if (!villa) return 'none';
  return scopeFor(villa.permissions, resource, action);
}
