import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encode } from '@auth/core/jwt';

const SECRET = 'test-secret-at-least-32-chars-xxxx';
const COOKIE_NAME = 'authjs.session-token';

const { mockUserFindUnique, mockTenantFindUnique, mockMembershipFindFirst, mockLocationFindFirst } =
  vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockMembershipFindFirst: vi.fn(),
    mockLocationFindFirst: vi.fn(),
  }));

vi.mock('./prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    tenant: { findUnique: mockTenantFindUnique },
    membership: { findFirst: mockMembershipFindFirst },
    location: { findFirst: mockLocationFindFirst },
  },
}));

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

import { buildContext, type ContextRequest } from './context.js';

function makeReq(headers: ContextRequest['headers']): ContextRequest {
  return { headers };
}

async function makeCookie(userId: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await encode({
    secret: SECRET,
    salt: COOKIE_NAME,
    token: { sub: userId, iat: nowSec, exp: nowSec + 60 * 60 },
  });
  return `${COOKIE_NAME}=${token}`;
}

beforeEach(() => {
  mockUserFindUnique.mockReset();
  mockTenantFindUnique.mockReset();
  mockMembershipFindFirst.mockReset();
  mockLocationFindFirst.mockReset();
});

describe('buildContext', () => {
  it('returns anonymous when no cookie is set', async () => {
    const ctx = await buildContext(makeReq({}));
    expect(ctx.auth.kind).toBe('anonymous');
    expect(typeof ctx.requestId).toBe('string');
    expect(ctx.requestId.length).toBeGreaterThan(0);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('preserves the supplied X-Request-Id', async () => {
    const ctx = await buildContext(makeReq({ 'x-request-id': 'req-fixed-123' }));
    expect(ctx.requestId).toBe('req-fixed-123');
  });

  it('returns anonymous when authenticated but no tenant header', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', status: 'ACTIVE' });
    const cookie = await makeCookie('user-1');
    const ctx = await buildContext(makeReq({ cookie }));
    expect(ctx.auth.kind).toBe('anonymous');
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });

  it('returns anonymous when tenant slug does not match', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', status: 'ACTIVE' });
    mockTenantFindUnique.mockResolvedValueOnce(null);
    const cookie = await makeCookie('user-1');
    const ctx = await buildContext(makeReq({ cookie, 'x-tenant-slug': 'unknown' }));
    expect(ctx.auth.kind).toBe('anonymous');
  });

  it('returns anonymous when user has no membership in the tenant', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', status: 'ACTIVE' });
    mockTenantFindUnique.mockResolvedValueOnce({
      id: 'tenant-1',
      slug: 'acme',
    });
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    const cookie = await makeCookie('user-1');
    const ctx = await buildContext(makeReq({ cookie, 'x-tenant-slug': 'acme' }));
    expect(ctx.auth.kind).toBe('anonymous');
  });

  it('returns authenticated context for tenant-wide membership (location null)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', status: 'ACTIVE' });
    mockTenantFindUnique.mockResolvedValueOnce({
      id: 'tenant-1',
      slug: 'acme',
    });
    mockMembershipFindFirst.mockResolvedValueOnce({
      id: 'mem-1',
      role: 'OWNER',
      locationId: null,
      user: { id: 'user-1', email: 'owner@acme.test' },
    });
    const cookie = await makeCookie('user-1');
    const ctx = await buildContext(makeReq({ cookie, 'x-tenant-slug': 'acme' }));
    expect(ctx.auth).toMatchObject({
      kind: 'authenticated',
      role: 'OWNER',
      tenant: { id: 'tenant-1', slug: 'acme' },
      user: { id: 'user-1', email: 'owner@acme.test' },
      location: null,
    });
    expect(mockLocationFindFirst).not.toHaveBeenCalled();
  });

  it('returns authenticated context with location resolved when provided', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1', status: 'ACTIVE' });
    mockTenantFindUnique.mockResolvedValueOnce({
      id: 'tenant-1',
      slug: 'acme',
    });
    mockMembershipFindFirst.mockResolvedValueOnce({
      id: 'mem-1',
      role: 'MANAGER',
      locationId: 'loc-1',
      user: { id: 'user-1', email: 'mgr@acme.test' },
    });
    mockLocationFindFirst.mockResolvedValueOnce({
      id: 'loc-1',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
    });
    const cookie = await makeCookie('user-1');
    const ctx = await buildContext(
      makeReq({
        cookie,
        'x-tenant-slug': 'acme',
        'x-location-id': 'loc-1',
      }),
    );
    expect(ctx.auth).toMatchObject({
      kind: 'authenticated',
      role: 'MANAGER',
      tenant: { id: 'tenant-1', slug: 'acme' },
      user: { id: 'user-1', email: 'mgr@acme.test' },
      location: {
        id: 'loc-1',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
      },
    });
  });
});
