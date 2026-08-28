import { randomBytes } from 'node:crypto';
import path from 'node:path';

const SAMPLE_SECRETS = new Set([
  'dev-only-access-secret-change-me',
  'dev-only-refresh-secret-change-me',
  'change-me',
]);

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

const nodeEnv = env('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

/**
 * In production a missing or sample secret is fatal: signing tokens with a
 * value that ships in the repository would let anyone mint an admin session.
 * In development we generate an ephemeral secret so `npm run dev` works with no
 * setup, at the cost of invalidating sessions on restart.
 */
function secret(name: string): string {
  const value = process.env[name];
  if (!value || SAMPLE_SECRETS.has(value)) {
    if (isProduction) {
      throw new Error(
        `${name} must be set to a unique random value in production. ` +
          `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
      );
    }
    return value ?? randomBytes(48).toString('hex');
  }
  return value;
}

const rootDir = path.resolve(import.meta.dirname, '..');

/** `:memory:` is a SQLite keyword, not a path, so it must survive resolution. */
function resolveDatabasePath(value: string): string {
  return value === ':memory:' ? value : path.resolve(rootDir, value);
}

export const config = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: intEnv('PORT', 4000),
  databasePath: resolveDatabasePath(env('DATABASE_PATH', './data/villa.sqlite')),
  uploadDir: path.resolve(rootDir, env('UPLOAD_DIR', './uploads')),
  maxUploadBytes: intEnv('MAX_UPLOAD_BYTES', 10 * 1024 * 1024),
  appUrl: env('APP_URL', 'http://localhost:5173'),
  accessSecret: secret('JWT_ACCESS_SECRET'),
  refreshSecret: secret('JWT_REFRESH_SECRET'),
  accessTokenTtlMinutes: intEnv('ACCESS_TOKEN_TTL_MINUTES', 15),
  refreshTokenTtlDays: intEnv('REFRESH_TOKEN_TTL_DAYS', 30),
  invitationTtlDays: intEnv('INVITATION_TTL_DAYS', 14),
  /**
   * Directory of the built web client. When set, the API also serves the SPA,
   * so the whole app runs on one origin behind one port — which is what the
   * container image does.
   */
  webDist: process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : null,
  /**
   * Marks the refresh cookie `Secure`. On by default in production, because a
   * session cookie should not travel in clear text.
   *
   * It can be turned off for a deployment reached over plain HTTP — an IP
   * address with no certificate, say — because a `Secure` cookie is silently
   * dropped there and sign-in would fail with no visible cause. That is a
   * stopgap: point a domain at the server and turn it back on.
   */
  cookieSecure: boolEnv('COOKIE_SECURE', isProduction),
  /** Hops of reverse proxy in front of the app; 0 disables proxy trust. */
  trustProxy: intEnv('TRUST_PROXY', 1),
  smtpUrl: process.env.SMTP_URL ?? null,
  mailFrom: process.env.MAIL_FROM ?? 'Villa Saya <no-reply@example.com>',
} as const;
