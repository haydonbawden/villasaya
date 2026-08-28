export type User = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarColour: string;
  locale: string;
};

export type VillaSummary = {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  timezone: string;
  currency: string;
  membershipId: string;
  memberCount?: number;
  role: { key: string; name: string; isOwner: boolean };
};

export type PermissionDefinition = {
  key: string;
  group: string;
  label: string;
  description: string;
  elevated?: boolean;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  colour: string;
  permissions: string[];
  isSystem: boolean;
  isOwner: boolean;
  rank: number;
  memberCount: number;
};

export type Member = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarColour: string;
  lastSeenAt: string | null;
  jobTitle: string | null;
  status: string;
  role: { id: string; key: string; name: string; colour: string; isOwner: boolean };
  permissionOverrides: { grant: string[]; deny: string[] };
  effectivePermissions: string[];
  employmentType?: string;
  payRateMinor?: number | null;
  payPeriod?: string;
  annualLeaveDays?: number;
  startedOn?: string | null;
};

export type Task = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  location: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  dueAt: string | null;
  recurrence: string | null;
  category: { id: string; name: string | null; colour: string | null } | null;
  assignees: Array<{ membershipId: string; fullName: string; avatarColour: string }>;
  createdBy: string;
  completedAt: string | null;
  createdAt: string;
};

export type Shift = {
  id: string;
  membershipId: string | null;
  staffName: string | null;
  avatarColour: string | null;
  jobTitle: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  paidMinutes: number;
  location: string | null;
  notes: string | null;
  status: 'draft' | 'published' | 'cancelled';
  isOpen: boolean;
};

export type LeaveType = {
  id: string;
  name: string;
  colour: string;
  isPaid: boolean;
  defaultQuotaDays: number | null;
  requiresApproval: boolean;
};

export type LeaveRequest = {
  id: string;
  membershipId: string;
  staffName: string;
  avatarColour: string;
  leaveType: { id: string; name: string; colour: string; isPaid: boolean };
  startDate: string;
  endDate: string;
  startHalfDay: boolean;
  endHalfDay: boolean;
  totalDays: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decisionNote: string | null;
  decidedBy: string | null;
  createdAt: string;
};

export type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  colour: string;
  quotaDays: number | null;
  takenDays: number;
  pendingDays: number;
  remainingDays: number | null;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  colour: string;
  autoApproveLimitMinor: number | null;
};

export type ExpenseClaim = {
  id: string;
  reference: string;
  membershipId: string;
  staffName: string;
  avatarColour: string;
  category: { id: string; name: string | null; colour: string | null } | null;
  title: string;
  description: string | null;
  amountMinor: number;
  currency: string;
  spentOn: string;
  merchant: string | null;
  paymentMethod: 'own_funds' | 'villa_cash' | 'villa_card';
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed' | 'cancelled';
  decisionNote: string | null;
  decidedBy: string | null;
  reimbursedAt: string | null;
  receipts: Array<{ id: string; filename: string; mimeType: string; byteSize: number }>;
  createdAt: string;
};

export type Channel = {
  id: string;
  kind: 'channel' | 'direct';
  name: string;
  topic: string | null;
  isPrivate: boolean;
  isDefault: boolean;
  members: Array<{ membershipId: string; fullName: string; avatarColour: string; role: string }>;
  unreadCount: number;
  lastMessageAt: string | null;
};

export type Message = {
  id: string;
  body: string | null;
  deleted: boolean;
  editedAt: string | null;
  replyToId: string | null;
  context: { type: string; id: string } | null;
  author: { membershipId: string; fullName: string; avatarColour: string };
  createdAt: string;
};

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};
