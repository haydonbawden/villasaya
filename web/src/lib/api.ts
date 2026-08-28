/**
 * Fetch wrapper for the villa API.
 *
 * The access token lives in memory only — never localStorage — so an XSS bug
 * cannot exfiltrate a long-lived credential. Durability comes from the
 * httpOnly refresh cookie, which `bootstrapSession` exchanges on page load.
 */

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, string> | unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.fieldErrors =
      payload.details && typeof payload.details === 'object' && !Array.isArray(payload.details)
        ? (payload.details as Record<string, string>)
        : {};
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

export type SessionPayload = {
  user: unknown;
  villas: unknown;
  accessToken: string;
  expiresIn: number;
};

/**
 * A single in-flight refresh, shared by every caller.
 *
 * Refresh tokens rotate on use, so two parallel calls would present the same
 * token twice. The server tolerates that within a grace window, but deduping
 * here means the common cases — StrictMode's double effect, several queries
 * hitting 401 together, two components mounting at once — cost one round trip
 * instead of racing.
 */
let refreshInFlight: Promise<SessionPayload> | null = null;

export function requestRefresh(): Promise<SessionPayload> {
  refreshInFlight ??= (async () => {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new ApiError(response.status, { code: 'unauthorised', message: 'Session expired' });
    const data = (await response.json()) as SessionPayload;
    accessToken = data.accessToken;
    return data;
  })().finally(() => {
    // Cleared on the next tick so every concurrent caller sees this result.
    queueMicrotask(() => {
      refreshInFlight = null;
    });
  });
  return refreshInFlight;
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    await requestRefresh();
    return true;
  } catch {
    return false;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Set for the auth endpoints, which must not trigger a refresh loop. */
  skipRefresh?: boolean;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`/api${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  };

  let response = await send();

  if (response.status === 401 && !options.skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await send();
    } else {
      accessToken = null;
      onSessionLost?.();
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const errorPayload = (payload as { error?: ApiErrorPayload }).error ?? {
      code: 'unknown',
      message: 'Something went wrong',
    };
    throw new ApiError(response.status, errorPayload);
  }
  return payload as T;
}

/** Uploads one file as a raw body; returns the stored attachment. */
export async function uploadFile(
  villaId: string,
  file: File,
): Promise<{ id: string; filename: string; mimeType: string; byteSize: number; url: string }> {
  const response = await fetch(`/api/villas/${villaId}/files`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': file.name,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: file,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new ApiError(response.status, (payload.error as ApiErrorPayload) ?? { code: 'unknown', message: 'Upload failed' });
  }
  return (payload as { attachment: { id: string; filename: string; mimeType: string; byteSize: number; url: string } })
    .attachment;
}
