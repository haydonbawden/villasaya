import { rolePermissions } from '@/providers/RoleProvider';
import { canAccess, isRoleAllowed, type Permission } from '@/utils/permissions';

describe('permission rules', () => {
  it('allows tenants to view analytics and manage staff', () => {
    const permissions = rolePermissions.tenant as readonly Permission[];
    expect(canAccess(permissions, 'analytics.view')).toBe(true);
    expect(canAccess(permissions, 'staff.manage')).toBe(true);
  });

  it('prevents contractors from managing tasks', () => {
    const permissions = rolePermissions.contractor as readonly Permission[];
    expect(canAccess(permissions, 'tasks.manage')).toBe(false);
    expect(isRoleAllowed('contractor', ['staff', 'manager'])).toBe(false);
  });

  it('requires all permissions when multiple are provided', () => {
    const permissions = ['tasks.manage', 'calendar.edit', 'analytics.view'] as Permission[];
    expect(canAccess(permissions, ['tasks.manage', 'analytics.view'])).toBe(true);
    expect(canAccess(permissions, ['tasks.manage', 'claims.approve'])).toBe(false);
  });
});
