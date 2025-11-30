import type { PropsWithChildren } from 'react';

import { createContext, useContext, useMemo, useState } from 'react';

export type RoleContextValue = {
  readonly permissions: readonly string[];
  readonly role: UserRole;
  readonly setRole: (nextRole: UserRole) => void;
};

export type UserRole = 'contractor' | 'landlord' | 'manager' | 'staff' | 'tenant';

const defaultRole: UserRole = 'tenant';

const rolePermissions: Record<UserRole, readonly string[]> = {
  contractor: ['tasks.guest', 'chat.guest', 'documents.view'],
  landlord: ['lease.view', 'claims.approve', 'chat.full', 'expenses.history'],
  manager: ['lease.edit', 'expenses.approve', 'documents.upload', 'chat.full', 'tasks.oversee'],
  staff: ['tasks.execute', 'calendar.view', 'claims.submit', 'chat.limited', 'documents.view'],
  tenant: [
    'tasks.manage',
    'staff.manage',
    'claims.review',
    'calendar.edit',
    'documents.view',
    'chat.full',
    'analytics.view',
  ],
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: PropsWithChildren) {
  const [role, setRole] = useState<UserRole>(defaultRole);

  const permissions = useMemo(() => {
    return rolePermissions[role];
  }, [role]);

  const value = useMemo(() => ({ permissions, role, setRole }), [role, permissions]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used inside RoleProvider');
  }
  return context;
}

export default RoleProvider;
