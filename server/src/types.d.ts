import type { RequestAuth, RequestVillaContext } from './auth/context.ts';

declare global {
  namespace Express {
    interface Request {
      /** Present on every route behind `authenticate`. */
      auth?: RequestAuth;
      /** Present on every route behind `withVilla`. */
      villa?: RequestVillaContext;
      /** Correlation id echoed in the `X-Request-Id` response header. */
      requestId?: string;
    }
  }
}

export {};
