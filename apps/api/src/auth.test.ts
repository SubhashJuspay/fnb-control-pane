import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encode } from '@auth/core/jwt';

const { mockUserFindUnique } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
}));

vi.mock('./prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

const SECRET = 'test-secret-at-least-32-chars-xxxx';
const COOKIE_NAME = 'authjs.session-token';
const SECURE_COOKIE_NAME = '__Secure-authjs.session-token';

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

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

async function makeAuthJsToken(opts: {
  sub: string;
  salt?: string;
  exp?: number;
}): Promise<string> {
  const salt = opts.salt ?? COOKIE_NAME;
  const nowSec = Math.floor(Date.now() / 1000);
  return encode({
    secret: SECRET,
    salt,
    token: {
      sub: opts.sub,
      iat: nowSec,
      exp: opts.exp ?? nowSec + 60 * 60,
    },
  });
}

describe('verifySession', () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no cookie is present', async () => {
    const result = await verifySession(undefined);
    expect(result).toBeNull();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when the cookie is missing the session token', async () => {
    const result = await verifySession('foo=bar; baz=qux');
    expect(result).toBeNull();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when the JWT cannot be decoded', async () => {
    const result = await verifySession('authjs.session-token=not-a-real-jwt');
    expect(result).toBeNull();
  });

  it('returns null when the JWT has expired', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredToken = await makeAuthJsToken({
      sub: 'user-1',
      exp: nowSec - 60,
    });
    const result = await verifySession(`${COOKIE_NAME}=${expiredToken}`);
    expect(result).toBeNull();
  });

  it('returns null when the user does not exist', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    const token = await makeAuthJsToken({ sub: 'missing-user' });
    const result = await verifySession(`${COOKIE_NAME}=${token}`);
    expect(result).toBeNull();
  });

  it('returns null when the user is not ACTIVE', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', status: 'INVITED' });
    const token = await makeAuthJsToken({ sub: 'u1' });
    const result = await verifySession(`${COOKIE_NAME}=${token}`);
    expect(result).toBeNull();
  });

  it('returns the verified session for a valid JWT and active user', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'u2', status: 'ACTIVE' });
    const token = await makeAuthJsToken({ sub: 'u2' });
    const result = await verifySession(`${COOKIE_NAME}=${token}`);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('u2');
    expect(result?.sessionToken).toBe(token);
    expect(result?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('also accepts the __Secure- prefixed cookie variant', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'u3', status: 'ACTIVE' });
    const token = await makeAuthJsToken({
      sub: 'u3',
      salt: SECURE_COOKIE_NAME,
    });
    const result = await verifySession(`${SECURE_COOKIE_NAME}=${token}`);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('u3');
  });
});
