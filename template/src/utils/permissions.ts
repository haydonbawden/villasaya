import type { UserRole } from '@/providers/RoleProvider';

export type Permission =
  | 'analytics.view'
  | 'calendar.edit'
  | 'calendar.view'
  | 'chat.full'
  | 'chat.guest'
  | 'chat.limited'
  | 'claims.approve'
  | 'claims.review'
  | 'claims.submit'
  | 'documents.upload'
  | 'documents.view'
  | 'expenses.approve'
  | 'expenses.history'
  | 'lease.edit'
  | 'lease.view'
  | 'staff.manage'
  | 'tasks.execute'
  | 'tasks.guest'
  | 'tasks.manage'
  | 'tasks.oversee';

export const permissionLabels: Record<Permission, string> = {
  'analytics.view': 'View analytics',
  'calendar.edit': 'Edit calendar events',
  'calendar.view': 'View calendar and roster',
  'chat.full': 'Full chat access',
  'chat.guest': 'Chat in guest channels',
  'chat.limited': 'Limited chat access',
  'claims.approve': 'Approve claims',
  'claims.review': 'Review reimbursement claims',
  'claims.submit': 'Submit expenses',
  'documents.upload': 'Upload documents',
  'documents.view': 'View documents',
  'expenses.approve': 'Approve villa expenses',
  'expenses.history': 'View expense history',
  'lease.edit': 'Edit lease metadata',
  'lease.view': 'View lease information',
  'staff.manage': 'Manage staff and rosters',
  'tasks.execute': 'Execute assigned tasks',
  'tasks.guest': 'Guest task access',
  'tasks.manage': 'Manage tasks',
  'tasks.oversee': 'Oversee task board',
};

export function canAccess(rolePermissions: readonly Permission[], required: Permission | readonly Permission[]) {
  if (Array.isArray(required)) {
    return (required as readonly Permission[]).every((permission) =>
      rolePermissions.includes(permission),
    );
  }
  return rolePermissions.includes(required);
}

export function isRoleAllowed(role: UserRole, allowed: readonly UserRole[]) {
  return allowed.includes(role);
}
