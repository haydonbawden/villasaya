export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'bad_request', message, details);

export const unauthorised = (message = 'Authentication required') =>
  new HttpError(401, 'unauthorised', message);

export const forbidden = (message = 'You do not have permission to do that', details?: unknown) =>
  new HttpError(403, 'forbidden', message, details);

export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, 'conflict', message, details);

export const tooLarge = (message: string) => new HttpError(413, 'payload_too_large', message);

export const unprocessable = (message: string, details?: unknown) =>
  new HttpError(422, 'unprocessable', message, details);

export const rateLimited = (message = 'Too many requests') =>
  new HttpError(429, 'rate_limited', message);
