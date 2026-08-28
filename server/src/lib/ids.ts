import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, no look-alikes.

/**
 * Sortable, URL-safe id: 10 chars of millisecond timestamp followed by 12 of
 * randomness. Sorting by id therefore sorts by creation time, which keeps
 * cursor pagination cheap without a secondary index.
 */
export function newId(prefix?: string): string {
  let time = Date.now();
  let timePart = '';
  for (let i = 0; i < 10; i += 1) {
    timePart = ALPHABET[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(12);
  let randomPart = '';
  for (const byte of bytes) randomPart += ALPHABET[byte % 32];
  const id = timePart + randomPart;
  return prefix ? `${prefix}_${id}` : id;
}

export function newUuid(): string {
  return randomUUID();
}

export function newToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}
