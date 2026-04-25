import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash a password using scrypt and return a string in the form
 * `scrypt:<salt-hex>:<hash-hex>`. Matches the format used by `packages/db`'s
 * seed script and Auth.js Credentials.authorize callback.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/** Verify a password against a stored `scrypt:<salt>:<hash>` string. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const hash = parts[2];
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
