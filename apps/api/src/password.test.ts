import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('hashes to scrypt:<salt>:<hash> format', () => {
    const h = hashPassword('hello-world');
    const parts = h.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it('verifies a correct password', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('wrong', stored)).toBe(false);
  });

  it('rejects malformed stored values', () => {
    expect(verifyPassword('x', 'not-the-right-format')).toBe(false);
    expect(verifyPassword('x', 'bcrypt:salt:hash')).toBe(false);
  });
});
