import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock('./prisma.js', () => ({
  prisma: {
    session: {
      findUnique: mockFindUnique,
    },
  },
}));

import { readSessionCookie, verifySession } from './auth.js';

describe('readSessionCookie', () => {
  it('returns null for undefined header', () => {
    expect(readSessionCookie(undefined)).toBeNull();
  });

  it('returns null for empty header', () => {
    expect(readSessionCookie('')).toBeNull();
  });

  it('parses a single cookie', () => {
    expect(readSessionCookie('authjs.session-token=abc123')).toBe('abc123');
  });

  it('parses one cookie among many', () => {
    const header = 'foo=bar; authjs.session-token=token-xyz; baz=qux';
    expect(readSessionCookie(header)).toBe('token-xyz');
  });

  it('falls back to the __Secure- variant when present', () => {
    expect(
      readSessionCookie('foo=bar; __Secure-authjs.session-token=secure-token'),
    ).toBe('secure-token');
  });

  it('prefers the unprefixed cookie when both are set', () => {
    const header =
      'authjs.session-token=plain; __Secure-authjs.session-token=secure';
    expect(readSessionCookie(header)).toBe('plain');
  });

  it('decodes URL-encoded values', () => {
    expect(readSessionCookie('authjs.session-token=hello%20world')).toBe(
      'hello world',
    );
  });

  it('returns null when cookie is absent', () => {
    expect(readSessionCookie('foo=bar; baz=qux')).toBeNull();
  });

  it('handles whitespace around cookie names and values', () => {
    expect(readSessionCookie('  authjs.session-token =  spaced  ')).toBe(
      'spaced',
    );
  });
});

describe('verifySession', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no cookie is present', async () => {
    const result = await verifySession(undefined);
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when the session row is missing', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await verifySession('authjs.session-token=tok-1');
    expect(result).toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { sessionToken: 'tok-1' },
      select: { userId: true, sessionToken: true, expires: true },
    });
  });

  it('returns null when the session has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    mockFindUnique.mockResolvedValueOnce({
      userId: 'user-1',
      sessionToken: 'tok-2',
      expires: new Date('2026-04-25T11:59:59Z'),
    });
    const result = await verifySession('authjs.session-token=tok-2');
    expect(result).toBeNull();
  });

  it('returns the verified session when valid', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    const expires = new Date('2026-05-01T00:00:00Z');
    mockFindUnique.mockResolvedValueOnce({
      userId: 'user-2',
      sessionToken: 'tok-3',
      expires,
    });
    const result = await verifySession('authjs.session-token=tok-3');
    expect(result).toEqual({
      userId: 'user-2',
      sessionToken: 'tok-3',
      expiresAt: expires,
    });
  });
});
