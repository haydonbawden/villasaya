import type { Options } from 'ky';

import { instance, setAuthorizationToken } from '@/services/instance';

import * as mockApi from './mockApi';
import { apiSchemas } from './schemas';
import type {
  AnalyticsInsight,
  AuthCredentials,
  AuthSession,
  CalendarEvent,
  ExpenseClaim,
  Incident,
  Lease,
  Profile,
  StaffRoster,
  Task,
  Villa,
} from './schemas';

const shouldUseMockApi = () => process.env.USE_MOCK_API === 'true' || !process.env.API_URL;

const normalizePath = (path: string) => path.replace(/^\//, '');

async function request<T>(path: string, options?: Options) {
  const response = await instance(normalizePath(path), options);
  return (await response.json()) as T;
}

export async function login(credentials: AuthCredentials): Promise<AuthSession> {
  if (shouldUseMockApi()) {
    const session = await mockApi.login(credentials);
    setAuthorizationToken(session.token);
    return session;
  }

  const session = await request<AuthSession>(apiSchemas.auth.login.path, { json: credentials, method: 'post' });
  setAuthorizationToken(session.token);
  return session;
}

export async function signup(credentials: AuthCredentials): Promise<AuthSession> {
  if (shouldUseMockApi()) {
    const session = await mockApi.signup(credentials);
    setAuthorizationToken(session.token);
    return session;
  }

  const session = await request<AuthSession>(apiSchemas.auth.signup.path, { json: credentials, method: 'post' });
  setAuthorizationToken(session.token);
  return session;
}

export async function fetchDashboard(): Promise<{ readonly profile: Profile; readonly tasks: readonly Task[]; readonly villas: readonly Villa[] }> {
  if (shouldUseMockApi()) {
    return mockApi.fetchDashboard();
  }

  return request(apiSchemas.analytics.monthly.path.replace(':id', 'default'));
}

export async function fetchTasks(villaId = 'default'): Promise<readonly Task[]> {
  if (shouldUseMockApi()) {
    return mockApi.fetchTasks();
  }

  const path = apiSchemas.tasks.list.path.replace(':id', villaId);
  return request(path);
}

export async function fetchRoster(villaId = 'default'): Promise<readonly StaffRoster[]> {
  if (shouldUseMockApi()) {
    return mockApi.fetchRoster();
  }

  const path = apiSchemas.staff.roster.path.replace(':id', villaId);
  return request(path);
}

export async function fetchCalendarEvents(villaId = 'default'): Promise<readonly CalendarEvent[]> {
  if (shouldUseMockApi()) {
    return mockApi.fetchCalendar();
  }

  const path = apiSchemas.calendar?.list?.path?.replace?.(':id', villaId) ?? 'calendar';
  return request(path);
}

export async function fetchClaims(villaId = 'default'): Promise<readonly ExpenseClaim[]> {
  if (shouldUseMockApi()) {
    return mockApi.fetchClaims();
  }

  const path = apiSchemas.claims.submit.path.replace(':id', villaId);
  return request(path);
}

export async function fetchIncidents(villaId = 'default'): Promise<readonly Incident[]> {
  if (shouldUseMockApi()) {
    return mockApi.fetchIncidents();
  }

  const path = apiSchemas.incidents.list.path.replace(':id', villaId);
  return request(path);
}

export async function fetchLease(villaId = 'default'): Promise<Lease> {
  if (shouldUseMockApi()) {
    return mockApi.fetchLease();
  }

  const path = apiSchemas.documents.list.path.replace(':id', villaId);
  return request(path);
}

export async function fetchAnalytics(): Promise<AnalyticsInsight> {
  if (shouldUseMockApi()) {
    return mockApi.fetchAnalytics();
  }

  return request(apiSchemas.analytics.monthly.path.replace(':id', 'default'));
}

export async function fetchMessages() {
  if (shouldUseMockApi()) {
    return mockApi.fetchMessages();
  }

  return request(apiSchemas.chat.messages.path.replace(':id', 'default'));
}
