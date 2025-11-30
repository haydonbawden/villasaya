import type {
  AnalyticsInsight,
  CalendarEvent,
  ChatRoom,
  Contact,
  ExpenseClaim,
  Incident,
  Lease,
  Message,
  Profile,
  StaffRoster,
  Task,
  TaskChecklistItem,
  Villa,
} from './schemas';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DELAY_FAST = 20;
const DELAY_SHORT = 30;
const DELAY_MEDIUM = 40;
const DELAY_STANDARD = 50;
const DELAY_LONG = 60;
const DELAY_EXTENDED = 80;
const DELAY_REVIEW = 90;
const DELAY_MAX = 120;

const demoProfile: Profile = {
  email: 'tenant@villasaya.app',
  fullName: 'Ayu Tenant',
  id: '1',
  role: 'tenant',
};

export async function fetchAnalytics(): Promise<AnalyticsInsight> {
  await delay(DELAY_SHORT);
  return {
    attendanceReliability: 0.87,
    expenseTotal: 12_000_000,
    incidentCount: 2,
    month: '2025-01',
    taskCompletionRate: 0.92,
  };
}

export async function fetchCalendar(): Promise<readonly CalendarEvent[]> {
  await delay(DELAY_STANDARD);
  return [
    {
      color: '#7c3aed',
      description: 'Pre-arrival reset',
      endTime: '14:00',
      eventDate: new Date().toISOString(),
      eventType: 'maintenance',
      id: 'c1',
      startTime: '10:00',
      title: 'Deep clean',
      villaId: 'v1',
    },
  ];
}

export async function fetchCalendarTasks(): Promise<readonly Task[]> {
  await delay(DELAY_STANDARD);
  return [
    { id: 't1', priority: 'medium', status: 'open', title: 'Garden trim', villaId: 'v1' },
  ];
}

export async function fetchChatRooms(): Promise<readonly ChatRoom[]> {
  await delay(DELAY_MEDIUM);
  return [
    { createdBy: '1', id: 'room1', isGroup: true, name: 'Villa Saya HQ', villaId: 'v1' },
  ];
}

export async function fetchChatSummaries(): Promise<readonly ChatRoom[]> {
  await delay(DELAY_MEDIUM);
  return [
    { createdBy: '1', id: 'summary1', isGroup: true, name: 'Ops Recap', villaId: 'v1' },
  ];
}

export async function fetchClaims(): Promise<readonly ExpenseClaim[]> {
  await delay(DELAY_REVIEW);
  return [
    {
      amount: 250_000,
      category: 'Supplies',
      description: 'Laundry detergent',
      id: 'ec1',
      ocrData: { amount: 250_000, date: new Date().toISOString(), merchant: 'BaliMart' },
      status: 'pending',
      submittedBy: 's1',
      submittedTo: '1',
      villaId: 'v1',
    },
  ];
}

export async function fetchContacts(): Promise<readonly Contact[]> {
  await delay(DELAY_SHORT);
  return [
    { company: 'BlueWater', id: 'co1', name: 'Pool Repair Co', phone: '+62 811 2345 678', villaId: 'v1' },
  ];
}

export async function fetchDashboard(): Promise<{
  readonly profile: Profile;
  readonly tasks: readonly Task[];
  readonly villas: readonly Villa[];
}> {
  await delay(DELAY_MAX);
  return {
    profile: demoProfile,
    tasks: [
      {
        dueDate: new Date().toISOString(),
        id: 't1',
        priority: 'medium',
        status: 'open',
        title: 'Morning pool skim',
        villaId: 'v1',
      },
    ],
    villas: [
      { address: 'Canggu, Bali', id: 'v1', name: 'Villa Saya', tenantId: '1', timezone: 'Asia/Makassar' },
    ],
  };
}

export async function fetchIncidents(): Promise<readonly Incident[]> {
  await delay(DELAY_SHORT);
  return [
    {
      description: 'Small drip near filter',
      id: 'in1',
      photos: ['https://example.com/pump.jpg'],
      reportedBy: 's1',
      severity: 'medium',
      status: 'in_review',
      title: 'Water pump leak',
      villaId: 'v1',
    },
  ];
}

export async function fetchLease(): Promise<Lease> {
  await delay(DELAY_FAST);
  return {
    contractFileUrl: 'https://example.com/lease.pdf',
    endDate: '2026-01-01',
    id: 'lease1',
    propertyManagerId: 'mgr1',
    rentAmount: 50_000_000,
    rentDueDay: 1,
    startDate: '2024-01-01',
    villaId: 'v1',
  };
}

export async function fetchMessages(): Promise<readonly Message[]> {
  await delay(DELAY_STANDARD);
  return [
    {
      content: 'Welcome to VillaSaya operations hub!',
      createdAt: new Date().toISOString(),
      id: 'm1',
      roomId: 'room1',
      senderId: '1',
    },
  ];
}
export async function fetchRoster(): Promise<readonly StaffRoster[]> {
  await delay(DELAY_EXTENDED);
  return [
    {
      id: 'r1',
      shiftEnd: '16:00',
      shiftStart: '08:00',
      staffId: 's1',
      villaId: 'v1',
      workDate: new Date().toISOString(),
    },
  ];
}

export async function fetchTaskDetail(): Promise<{ readonly checklist: readonly TaskChecklistItem[]; readonly task: Task }>

export async function fetchTaskDetail() {
  await delay(DELAY_LONG);
  const task: Task = {
    description: 'Restock amenities and arrange flowers',
    dueDate: new Date().toISOString(),
    id: 't1',
    priority: 'high',
    requiresCompletionPhoto: true,
    status: 'in_progress',
    title: 'Prepare guest welcome',
    villaId: 'v1',
  };
  const checklist: TaskChecklistItem[] = [
    { id: 'chk1', isCompleted: false, taskId: 't1', text: 'Restock towels' },
    { id: 'chk2', isCompleted: true, taskId: 't1', text: 'Place welcome card' },
  ];
  return { checklist, task };
}
