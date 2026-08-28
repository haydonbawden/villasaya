import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-not-used-anywhere-else';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-not-used-anywhere-else';

const { migrate, useDatabase } = await import('../src/db/index.ts');
const { createApp } = await import('../src/app.ts');
const { resetRateLimits } = await import('../src/lib/rateLimit.ts');

/**
 * Each test file gets its own in-memory database and its own HTTP server on an
 * ephemeral port, so files can run without sharing state.
 *
 * Call this at module scope and pass the returned `close` to `after()` — a
 * server started inside a `before` hook gets torn down with that hook.
 */
export async function startTestServer(): Promise<{ url: string; close: () => void }> {
  const db = new DatabaseSync(':memory:');
  useDatabase(db);
  migrate(db);
  resetRateLimits();

  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  const close = () => {
    server.close();
    db.close();
  };
  return { url, close };
}

export type Response<T> = { status: number; body: T; headers: Headers };

/** Minimal typed HTTP client that carries an access token and cookies. */
export class Client {
  private token: string | null = null;
  private cookies = new Map<string, string>();
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    const response = await fetch(`${this.baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const index = pair?.indexOf('=') ?? -1;
      if (pair && index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as T) : ({} as T);
    return { status: response.status, body: parsed, headers: response.headers };
  }

  get<T = Record<string, unknown>>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = Record<string, unknown>>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body ?? {});
  }
  patch<T = Record<string, unknown>>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  put<T = Record<string, unknown>>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body);
  }
  delete<T = Record<string, unknown>>(path: string, body?: unknown) {
    return this.request<T>('DELETE', path, body ?? {});
  }
}

type SessionBody = {
  user: { id: string; email: string; fullName: string };
  villas: Array<{ id: string; name: string; membershipId: string; role: { key: string; isOwner: boolean } }>;
  accessToken: string;
};

export type Actor = { client: Client; userId: string; email: string };

/** Registers an owner and their first villa in one step. */
export async function createOwner(
  baseUrl: string,
  options: { email: string; villaName: string; fullName?: string },
): Promise<Actor & { villaId: string; membershipId: string }> {
  const client = new Client(baseUrl);
  const response = await client.post<SessionBody>('/auth/register', {
    email: options.email,
    password: 'test-passphrase-2026',
    fullName: options.fullName ?? 'Test Owner',
    villaName: options.villaName,
  });
  if (response.status !== 201) {
    throw new Error(`createOwner failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  client.setToken(response.body.accessToken);
  const villa = response.body.villas[0]!;
  return {
    client,
    userId: response.body.user.id,
    email: options.email,
    villaId: villa.id,
    membershipId: villa.membershipId,
  };
}

/** Invites someone, registers them through the invitation, and returns them. */
export async function addStaff(
  baseUrl: string,
  owner: Actor & { villaId: string },
  options: { email: string; roleKey?: string; fullName?: string; jobTitle?: string },
): Promise<Actor & { membershipId: string }> {
  const roles = await owner.client.get<{ roles: Array<{ id: string; key: string }> }>(
    `/villas/${owner.villaId}/roles`,
  );
  const role = roles.body.roles.find((candidate) => candidate.key === (options.roleKey ?? 'staff'));
  if (!role) throw new Error(`role ${options.roleKey ?? 'staff'} not found`);

  const invitation = await owner.client.post<{ inviteLink: string }>(`/villas/${owner.villaId}/invitations`, {
    email: options.email,
    roleId: role.id,
    jobTitle: options.jobTitle,
  });
  if (invitation.status !== 201) {
    throw new Error(`invite failed: ${invitation.status} ${JSON.stringify(invitation.body)}`);
  }
  const token = invitation.body.inviteLink.split('/').pop()!;

  const client = new Client(baseUrl);
  const registration = await client.post<SessionBody>('/auth/register', {
    email: options.email,
    password: 'test-passphrase-2026',
    fullName: options.fullName ?? 'Test Staff',
    invitationToken: token,
  });
  if (registration.status !== 201) {
    throw new Error(`staff register failed: ${registration.status} ${JSON.stringify(registration.body)}`);
  }
  client.setToken(registration.body.accessToken);

  const members = await owner.client.get<{ members: Array<{ id: string; email: string }> }>(
    `/villas/${owner.villaId}/members`,
  );
  const membership = members.body.members.find((member) => member.email === options.email);
  return { client, userId: registration.body.user.id, email: options.email, membershipId: membership!.id };
}

/** Overwrites a role's permission set — used to test the matrix editor's effect. */
export async function setRolePermissions(
  owner: Actor & { villaId: string },
  roleKey: string,
  permissions: string[],
): Promise<void> {
  const roles = await owner.client.get<{ roles: Array<{ id: string; key: string }> }>(
    `/villas/${owner.villaId}/roles`,
  );
  const role = roles.body.roles.find((candidate) => candidate.key === roleKey)!;
  const response = await owner.client.patch(`/villas/${owner.villaId}/roles/${role.id}`, { permissions });
  if (response.status !== 200) {
    throw new Error(`setRolePermissions failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
}

export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function dateDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
