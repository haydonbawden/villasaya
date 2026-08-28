import { execute, query } from '../db/index.ts';
import { emitToUsers } from '../realtime/hub.ts';
import { newId } from './ids.ts';

export type NotificationInput = {
  villaId: string;
  /** Membership ids of the people to notify. */
  membershipIds: string[];
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  payload?: Record<string, unknown>;
  /** Membership id of whoever caused the event; never notified about their own action. */
  actorMembershipId?: string | null;
};

/**
 * Writes a notification per recipient and pushes it to any open socket. Rows
 * are written even when the recipient is offline, so the bell icon is correct
 * on next login.
 */
export function notify(input: NotificationInput): void {
  const recipients = [...new Set(input.membershipIds)].filter(
    (id) => id && id !== input.actorMembershipId,
  );
  if (recipients.length === 0) return;

  const placeholders = recipients.map(() => '?').join(', ');
  const users = query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM memberships
      WHERE villa_id = ? AND status = 'active' AND id IN (${placeholders})`,
    [input.villaId, ...recipients],
  );
  if (users.length === 0) return;

  const now = new Date().toISOString();
  const payload = JSON.stringify(input.payload ?? {});
  for (const user of users) {
    execute(
      `INSERT INTO notifications (id, villa_id, user_id, kind, title, body, link, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), input.villaId, user.user_id, input.kind, input.title, input.body ?? null, input.link ?? null, payload, now],
    );
  }

  emitToUsers(
    users.map((user) => user.user_id),
    {
      type: 'notification.created',
      villaId: input.villaId,
      payload: { kind: input.kind, title: input.title, body: input.body ?? null, link: input.link ?? null },
    },
  );
}

/** Membership ids holding a permission — used to route approval notifications. */
export function membershipsWithPermission(villaId: string, permission: string): string[] {
  const rows = query<{ id: string; permissions: string; permission_overrides: string }>(
    `SELECT m.id, r.permissions, m.permission_overrides
       FROM memberships m
       JOIN roles r ON r.id = m.role_id
      WHERE m.villa_id = ? AND m.status = 'active'`,
    [villaId],
  );
  const matched: string[] = [];
  for (const row of rows) {
    const rolePermissions = safeArray(row.permissions);
    const overrides = safeOverrides(row.permission_overrides);
    if (overrides.deny.includes(permission)) continue;
    if (overrides.grant.includes(permission)) {
      matched.push(row.id);
      continue;
    }
    if (rolePermissions.includes('*') || rolePermissions.includes(permission)) matched.push(row.id);
  }
  return matched;
}

function safeArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function safeOverrides(raw: string): { grant: string[]; deny: string[] } {
  try {
    const parsed = JSON.parse(raw) as { grant?: unknown; deny?: unknown };
    return {
      grant: Array.isArray(parsed.grant) ? (parsed.grant as string[]) : [],
      deny: Array.isArray(parsed.deny) ? (parsed.deny as string[]) : [],
    };
  } catch {
    return { grant: [], deny: [] };
  }
}
