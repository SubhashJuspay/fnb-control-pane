import { scryptSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPassword } from './password';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

describe('verifyPassword', () => {
  it('accepts a hash produced by the same scrypt format', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('hunter2', stored)).toBe(false);
  });

  it('rejects a malformed stored value', () => {
    expect(verifyPassword('any', 'not-a-real-hash')).toBe(false);
    expect(verifyPassword('any', 'bcrypt:salt:hash')).toBe(false);
    expect(verifyPassword('any', 'scrypt:onlyone')).toBe(false);
    expect(verifyPassword('any', '')).toBe(false);
  });
});
