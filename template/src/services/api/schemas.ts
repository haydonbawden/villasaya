export type AnalyticsInsight = {
  readonly attendanceReliability: number;
  readonly expenseTotal: number;
  readonly incidentCount: number;
  readonly month: string;
  readonly taskCompletionRate: number;
};

export type CalendarEvent = {
  readonly color?: string;
  readonly description?: string;
  readonly endTime?: string;
  readonly eventDate: string;
  readonly eventType: 'general' | 'holiday' | 'maintenance' | 'roster';
  readonly id: string;
  readonly startTime?: string;
  readonly title: string;
  readonly villaId: string;
};

export type ChatRoom = {
  readonly createdBy: string;
  readonly id: string;
  readonly isGroup: boolean;
  readonly name: string;
  readonly villaId: string;
};

export type Contact = {
  readonly company?: string;
  readonly email?: string;
  readonly id: string;
  readonly name: string;
  readonly notes?: string;
  readonly phone?: string;
  readonly villaId: string;
};

export type ExpenseClaim = {
  readonly amount: number;
  readonly category: string;
  readonly description?: string;
  readonly forwardedTo?: string;
  readonly id: string;
  readonly ocrData?: Record<string, unknown>;
  readonly receiptPhotoUrl?: string;
  readonly status: 'approved' | 'forwarded' | 'pending' | 'rejected';
  readonly submittedBy: string;
  readonly submittedTo: string;
  readonly villaId: string;
};

export type Incident = {
  readonly description: string;
  readonly id: string;
  readonly photos?: readonly string[];
  readonly reportedBy: string;
  readonly severity: 'critical' | 'high' | 'low' | 'medium';
  readonly status: 'closed' | 'converted_to_task' | 'in_review' | 'open';
  readonly title: string;
  readonly videos?: readonly string[];
  readonly villaId: string;
};

export type Lease = {
  readonly contractFileUrl?: string;
  readonly endDate: string;
  readonly id: string;
  readonly propertyManagerId?: string;
  readonly rentAmount: number;
  readonly rentDueDay: number;
  readonly startDate: string;
  readonly villaId: string;
};

export type Message = {
  readonly content?: string;
  readonly createdAt: string;
  readonly id: string;
  readonly mediaUrl?: string;
  readonly replyTo?: string;
  readonly roomId: string;
  readonly senderId: string;
  readonly voiceNoteUrl?: string;
};

export type Profile = {
  readonly bankDetails?: Record<string, unknown>;
  readonly defaultVillaId?: string;
  readonly email?: string;
  readonly employmentEnd?: string;
  readonly employmentStart?: string;
  readonly fullName: string;
  readonly id: string;
  readonly phone?: string;
  readonly position?: string;
  readonly role: 'contractor' | 'landlord' | 'manager' | 'staff' | 'tenant';
};

export type StaffRoster = {
  readonly id: string;
  readonly shiftEnd: string;
  readonly shiftStart: string;
  readonly staffId: string;
  readonly villaId: string;
  readonly workDate: string;
};

export type Task = {
  readonly description?: string;
  readonly dueDate?: string;
  readonly dueTime?: string;
  readonly id: string;
  readonly priority: 'high' | 'low' | 'medium';
  readonly recurrenceRule?: string;
  readonly requiresCompletionPhoto?: boolean;
  readonly status: 'completed' | 'in_progress' | 'open' | 'overdue';
  readonly title: string;
  readonly villaId: string;
};

export type TaskChecklistItem = {
  readonly id: string;
  readonly isCompleted: boolean;
  readonly taskId: string;
  readonly text: string;
};

export type Villa = {
  readonly address: string;
  readonly id: string;
  readonly landlordId?: string;
  readonly managerId?: string;
  readonly name: string;
  readonly tenantId?: string;
  readonly timezone?: string;
};

export const apiSchemas = {
  analytics: {
    monthly: { method: 'GET', path: '/villas/:id/analytics/monthly' },
  },
  auth: {
    login: { method: 'POST', path: '/auth/login' },
    signup: { method: 'POST', path: '/auth/signup' },
    verify: { method: 'POST', path: '/auth/verify' },
  },
  chat: {
    messages: { method: 'GET', path: '/chat/rooms/:id/messages' },
    rooms: { method: 'GET', path: '/villas/:id/chat/rooms' },
  },
  claims: {
    approve: { method: 'POST', path: '/claims/:id/approve' },
    escalate: { method: 'POST', path: '/claims/:id/escalate' },
    submit: { method: 'POST', path: '/villas/:id/claims' },
  },
  documents: {
    list: { method: 'GET', path: '/villas/:id/documents' },
    upload: { method: 'POST', path: '/villas/:id/documents' },
  },
  incidents: {
    create: { method: 'POST', path: '/villas/:id/incidents' },
    list: { method: 'GET', path: '/villas/:id/incidents' },
  },
  profiles: {
    detail: { method: 'GET', path: '/profiles/:id' },
    list: { method: 'GET', path: '/profiles' },
    update: { method: 'PATCH', path: '/profiles/:id' },
  },
  staff: {
    attendance: { method: 'POST', path: '/villas/:id/attendance' },
    leave: { method: 'POST', path: '/villas/:id/leave' },
    roster: { method: 'GET', path: '/villas/:id/roster' },
  },
  tasks: {
    complete: { method: 'POST', path: '/tasks/:id/complete' },
    create: { method: 'POST', path: '/villas/:id/tasks' },
    detail: { method: 'GET', path: '/tasks/:id' },
    list: { method: 'GET', path: '/villas/:id/tasks' },
  },
} as const;
