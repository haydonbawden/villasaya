/**
 * Permission catalogue.
 *
 * A permission key is `resource:action` and, where a capability can be limited
 * to the member's own records, a matching `.own` variant exists alongside the
 * `.all` variant. Route handlers ask for the broad permission first and fall
 * back to the narrow one, scoping the query when only the narrow one is held —
 * see `scopeFor()` below.
 *
 * The catalogue is the single source of truth for the permission matrix the
 * owner edits in the UI, so adding a capability here is all that is needed for
 * it to appear as a toggle.
 */

export type PermissionKey = string;

export type PermissionDefinition = {
  key: PermissionKey;
  group: string;
  label: string;
  description: string;
  /** Marks a permission that grants access to other people's records. */
  elevated?: boolean;
};

export const PERMISSION_GROUPS = [
  'Workspace',
  'People',
  'Tasks',
  'Roster',
  'Leave',
  'Expenses',
  'Messaging',
  'Reporting',
] as const;

export const PERMISSIONS: PermissionDefinition[] = [
  // Workspace ---------------------------------------------------------------
  { key: 'villa:view', group: 'Workspace', label: 'View workspace', description: 'See the villa workspace and its basic details.' },
  { key: 'villa:manage', group: 'Workspace', label: 'Edit villa settings', description: 'Rename the villa, change timezone, currency and week start.', elevated: true },
  { key: 'villa:delete', group: 'Workspace', label: 'Delete villa', description: 'Permanently delete the workspace and all its data.', elevated: true },

  // People ------------------------------------------------------------------
  { key: 'members:view', group: 'People', label: 'View staff directory', description: 'See who works at the villa and their job titles.' },
  { key: 'members:view_sensitive', group: 'People', label: 'View pay details', description: 'See pay rates, employment type and start dates.', elevated: true },
  { key: 'members:invite', group: 'People', label: 'Invite staff', description: 'Send invitations for new staff to join the workspace.', elevated: true },
  { key: 'members:manage', group: 'People', label: 'Manage staff records', description: 'Edit job titles, employment details and suspend members.', elevated: true },
  { key: 'members:remove', group: 'People', label: 'Remove staff', description: 'Remove a member from the workspace.', elevated: true },
  { key: 'roles:manage', group: 'People', label: 'Manage roles and permissions', description: 'Create roles and change what each role is allowed to do.', elevated: true },

  // Tasks -------------------------------------------------------------------
  { key: 'tasks:view.own', group: 'Tasks', label: 'View own tasks', description: 'See tasks assigned to you.' },
  { key: 'tasks:view.all', group: 'Tasks', label: 'View all tasks', description: 'See every task in the villa.', elevated: true },
  { key: 'tasks:create', group: 'Tasks', label: 'Create tasks', description: 'Add new tasks to the villa.' },
  { key: 'tasks:assign', group: 'Tasks', label: 'Assign tasks', description: 'Allocate tasks to other staff members.', elevated: true },
  { key: 'tasks:update.own', group: 'Tasks', label: 'Update own tasks', description: 'Change status and add comments on tasks assigned to you.' },
  { key: 'tasks:update.all', group: 'Tasks', label: 'Update any task', description: 'Edit any task in the villa.', elevated: true },
  { key: 'tasks:delete', group: 'Tasks', label: 'Delete tasks', description: 'Remove tasks from the villa.', elevated: true },

  // Roster ------------------------------------------------------------------
  { key: 'roster:view.own', group: 'Roster', label: 'View own roster', description: 'See your own published shifts.' },
  { key: 'roster:view.all', group: 'Roster', label: 'View full roster', description: 'See the shifts of everyone at the villa.', elevated: true },
  { key: 'roster:manage', group: 'Roster', label: 'Build the roster', description: 'Create, edit and delete shifts.', elevated: true },
  { key: 'roster:publish', group: 'Roster', label: 'Publish the roster', description: 'Release draft shifts so staff can see them.', elevated: true },
  { key: 'roster:swap.request', group: 'Roster', label: 'Request shift swaps', description: 'Ask to hand over one of your shifts.' },
  { key: 'roster:swap.approve', group: 'Roster', label: 'Approve shift swaps', description: 'Approve or reject swap requests.', elevated: true },

  // Leave -------------------------------------------------------------------
  { key: 'leave:view.own', group: 'Leave', label: 'View own leave', description: 'See your own leave requests and balance.' },
  { key: 'leave:view.all', group: 'Leave', label: 'View all leave', description: 'See leave requests and balances for all staff.', elevated: true },
  { key: 'leave:request', group: 'Leave', label: 'Request leave', description: 'Submit your own leave requests.' },
  { key: 'leave:approve', group: 'Leave', label: 'Approve leave', description: 'Approve or reject leave requests from staff.', elevated: true },
  { key: 'leave:manage_types', group: 'Leave', label: 'Manage leave types', description: 'Create leave types and set annual allowances.', elevated: true },

  // Expenses ----------------------------------------------------------------
  { key: 'expenses:view.own', group: 'Expenses', label: 'View own claims', description: 'See the expense claims you submitted.' },
  { key: 'expenses:view.all', group: 'Expenses', label: 'View all claims', description: 'See expense claims from every staff member.', elevated: true },
  { key: 'expenses:submit', group: 'Expenses', label: 'Submit claims', description: 'Create and submit your own expense claims.' },
  { key: 'expenses:approve', group: 'Expenses', label: 'Approve claims', description: 'Approve or reject submitted expense claims.', elevated: true },
  { key: 'expenses:reimburse', group: 'Expenses', label: 'Mark as reimbursed', description: 'Record that an approved claim has been paid out.', elevated: true },
  { key: 'expenses:manage_categories', group: 'Expenses', label: 'Manage expense categories', description: 'Create categories and set auto-approval limits.', elevated: true },

  // Messaging ---------------------------------------------------------------
  { key: 'messages:read', group: 'Messaging', label: 'Read messages', description: 'Read channels you are a member of.' },
  { key: 'messages:send', group: 'Messaging', label: 'Send messages', description: 'Post messages and direct messages.' },
  { key: 'messages:manage_channels', group: 'Messaging', label: 'Manage channels', description: 'Create, rename and archive channels.', elevated: true },
  { key: 'messages:moderate', group: 'Messaging', label: 'Moderate messages', description: "Delete other people's messages.", elevated: true },
  { key: 'files:upload', group: 'Messaging', label: 'Upload files', description: 'Attach receipts and photos.' },

  // Reporting ---------------------------------------------------------------
  { key: 'reports:view', group: 'Reporting', label: 'View reports', description: 'See labour cost, leave and expense summaries.', elevated: true },
  { key: 'audit:view', group: 'Reporting', label: 'View audit log', description: 'Inspect the record of who changed what.', elevated: true },
];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);
const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): boolean {
  return PERMISSION_KEY_SET.has(value);
}

/** Wildcard held only by the owner role; satisfies every check. */
export const ALL_PERMISSIONS = '*';

// ---------------------------------------------------------------------------
// System roles seeded into every new villa
// ---------------------------------------------------------------------------

export type SystemRoleTemplate = {
  key: string;
  name: string;
  description: string;
  colour: string;
  rank: number;
  isOwner?: boolean;
  permissions: PermissionKey[];
};

const STAFF_BASELINE: PermissionKey[] = [
  'villa:view',
  'members:view',
  'tasks:view.own',
  'tasks:update.own',
  'roster:view.own',
  'roster:swap.request',
  'leave:view.own',
  'leave:request',
  'expenses:view.own',
  'expenses:submit',
  'messages:read',
  'messages:send',
  'files:upload',
];

const SUPERVISOR: PermissionKey[] = [
  ...STAFF_BASELINE,
  'tasks:view.all',
  'tasks:create',
  'tasks:assign',
  'tasks:update.all',
  'roster:view.all',
  'leave:view.all',
  'expenses:view.all',
  'messages:manage_channels',
];

const MANAGER: PermissionKey[] = [
  ...SUPERVISOR,
  'villa:manage',
  'members:view_sensitive',
  'members:invite',
  'members:manage',
  'tasks:delete',
  'roster:manage',
  'roster:publish',
  'roster:swap.approve',
  'leave:approve',
  'leave:manage_types',
  'expenses:approve',
  'expenses:reimburse',
  'expenses:manage_categories',
  'messages:moderate',
  'reports:view',
];

export const SYSTEM_ROLES: SystemRoleTemplate[] = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Full control of the villa workspace, including billing and deletion.',
    colour: '#0f766e',
    rank: 0,
    isOwner: true,
    permissions: [ALL_PERMISSIONS],
  },
  {
    key: 'manager',
    name: 'Villa Manager',
    description: 'Runs day-to-day operations: roster, approvals and staff records.',
    colour: '#1d4ed8',
    rank: 10,
    permissions: MANAGER,
  },
  {
    key: 'supervisor',
    name: 'Supervisor',
    description: 'Allocates work and oversees the team without approval authority.',
    colour: '#7c3aed',
    rank: 20,
    permissions: SUPERVISOR,
  },
  {
    key: 'staff',
    name: 'Staff',
    description: 'Sees their own roster, tasks, leave and claims.',
    colour: '#64748b',
    rank: 30,
    permissions: STAFF_BASELINE,
  },
];

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type PermissionOverrides = { grant: PermissionKey[]; deny: PermissionKey[] };

export function parseOverrides(raw: string | null | undefined): PermissionOverrides {
  if (!raw) return { grant: [], deny: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<PermissionOverrides>;
    return {
      grant: Array.isArray(parsed.grant) ? parsed.grant.filter(isPermissionKey) : [],
      deny: Array.isArray(parsed.deny) ? parsed.deny.filter(isPermissionKey) : [],
    };
  } catch {
    return { grant: [], deny: [] };
  }
}

export function parsePermissionList(raw: string | null | undefined): PermissionKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string =>
        typeof value === 'string' && (value === ALL_PERMISSIONS || isPermissionKey(value)),
    );
  } catch {
    return [];
  }
}

/**
 * Effective set = role permissions + per-member grants − per-member denials.
 *
 * Denial wins over a grant, and it wins over the owner wildcard too, so an
 * owner can carve a capability out of a deputy who otherwise inherits
 * everything. The owner's own membership is never given denials by the API.
 */
export function resolvePermissions(
  rolePermissions: PermissionKey[],
  overrides: PermissionOverrides,
): Set<PermissionKey> {
  const effective = new Set<PermissionKey>();
  if (rolePermissions.includes(ALL_PERMISSIONS)) {
    effective.add(ALL_PERMISSIONS);
    for (const key of PERMISSION_KEYS) effective.add(key);
  } else {
    // Unknown keys are dropped here as well as at the parse boundary, so a key
    // retired from the catalogue stops granting anything the moment it goes,
    // without a migration over every stored role.
    for (const key of rolePermissions) if (isPermissionKey(key)) effective.add(key);
  }
  for (const key of overrides.grant) if (isPermissionKey(key)) effective.add(key);
  for (const key of overrides.deny) {
    effective.delete(key);
    // A denial must also break the wildcard, otherwise `has('*')` would keep
    // satisfying the check it was meant to remove.
    effective.delete(ALL_PERMISSIONS);
  }
  return effective;
}

export function hasPermission(effective: Set<PermissionKey>, key: PermissionKey): boolean {
  return effective.has(key) || effective.has(ALL_PERMISSIONS);
}

export type AccessScope = 'all' | 'own' | 'none';

/**
 * Resolves a `.all` / `.own` permission pair into the widest scope held.
 * Handlers use the result to decide whether to filter a listing by the
 * caller's own membership id.
 */
export function scopeFor(effective: Set<PermissionKey>, resource: string, action = 'view'): AccessScope {
  if (hasPermission(effective, `${resource}:${action}.all`)) return 'all';
  if (hasPermission(effective, `${resource}:${action}.own`)) return 'own';
  return 'none';
}
