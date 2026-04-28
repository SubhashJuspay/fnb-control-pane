import { describe, expect, it } from 'vitest';
import { generateTrackingToken, hashTrackingToken } from './tracking-token.js';

describe('generateTrackingToken', () => {
  it('returns a token of at least 32 chars', () => {
    const { token } = generateTrackingToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('returns a base64url-safe token (no =, +, /)', () => {
    const { token } = generateTrackingToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns a hash that matches hashTrackingToken(token)', () => {
    const { token, tokenHash } = generateTrackingToken();
    expect(tokenHash).toBe(hashTrackingToken(token));
  });

  it('produces unique tokens on each call', () => {
    const a = generateTrackingToken();
    const b = generateTrackingToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe('hashTrackingToken', () => {
  it('is deterministic for the same token', () => {
    expect(hashTrackingToken('abc123')).toBe(hashTrackingToken('abc123'));
  });

  it('produces 64-char hex (sha256)', () => {
    expect(hashTrackingToken('whatever')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different tokens produce different hashes', () => {
    expect(hashTrackingToken('abc')).not.toBe(hashTrackingToken('abd'));
  });
});
