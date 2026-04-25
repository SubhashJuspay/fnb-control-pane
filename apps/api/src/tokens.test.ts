import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashToken } from './tokens.js';

describe('tokens', () => {
  it('generates URL-safe tokens with non-trivial entropy', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('hashToken returns the SHA-256 hex of the input', () => {
    const token = 'fixed-token';
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('generateInvitationToken tokenHash equals hashToken(token)', () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(hashToken(token)).toBe(tokenHash);
  });
});
