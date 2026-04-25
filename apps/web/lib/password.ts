import { scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Verify a password against a stored scrypt hash in the canonical
 * `scrypt:<salt>:<hash>` format. Returns false on any malformation —
 * never throws, always constant-time on length-matched paths.
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (typeof stored !== 'string' || stored.length === 0) return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  if (!salt || !hash) return false;
  let storedBuf: Buffer;
  try {
    storedBuf = Buffer.from(hash, 'hex');
    if (storedBuf.length === 0) return false;
  } catch {
    return false;
  }
  let computed: Buffer;
  try {
    computed = Buffer.from(scryptSync(password, salt, 64).toString('hex'), 'hex');
  } catch {
    return false;
  }
  if (computed.length !== storedBuf.length) return false;
  return timingSafeEqual(computed, storedBuf);
}
