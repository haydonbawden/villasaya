import type { RequestHandler } from 'express';
import { rateLimited } from './errors.ts';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter held in process memory. Adequate for a single-node
 * deployment, which is what a villa workspace runs on; a multi-node deployment
 * should swap the map for Redis without changing the call sites.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  key: (req: Parameters<RequestHandler>[0]) => string;
  message?: string;
}): RequestHandler {
  return (req, _res, next) => {
    const now = Date.now();
    const key = options.key(req);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const seconds = Math.ceil((bucket.resetAt - now) / 1000);
      return next(rateLimited(options.message ?? `Too many attempts, try again in ${seconds}s`));
    }
    next();
  };
}

/** Clears counters between tests. */
export function resetRateLimits(): void {
  buckets.clear();
}

// Opportunistic sweep so the map cannot grow without bound on a long-lived
// process. `unref` keeps it from holding the event loop open.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
sweep.unref();
