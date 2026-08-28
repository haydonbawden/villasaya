import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// ~64 MB of memory per hash: costly enough to blunt offline cracking, cheap
// enough for an interactive login on a small VPS.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export type PasswordProblem = string | null;

/**
 * Deliberately length-led rather than composition-led: a long passphrase beats
 * a short string with a symbol bolted on, and villa staff type these on phones.
 */
export function checkPasswordStrength(password: string): PasswordProblem {
  if (password.length < 10) return 'Password must be at least 10 characters long';
  if (password.length > 200) return 'Password must be 200 characters or fewer';
  const lowered = password.toLowerCase();
  const common = ['password', '12345678', 'qwerty', 'letmein', 'welcome', 'villa123'];
  if (common.some((candidate) => lowered.includes(candidate))) {
    return 'Password is too easy to guess, please choose something less common';
  }
  if (/^(.)\1+$/.test(password)) return 'Password cannot be a single repeated character';
  return null;
}
