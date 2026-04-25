import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSessionFindUnique,
  mockTenantFindUnique,
  mockMembershipFindFirst,
  mockLocationFindFirst,
} = vi.hoisted(() => ({
  mockSessionFindUnique: vi.fn(),
  mockTenantFindUnique: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
  mockLocationFindFirst: vi.fn(),
}));

vi.mock('./prisma.js', () => ({
  prisma: {
    session: { findUnique: mockSessionFindUnique },
    tenant: { findUnique: mockTenantFindUnique },
    membership: { findFirst: mockMembershipFindFirst },
    location: { findFirst: mockLocationFindFirst },
  },
}));

import { buildContext, type ContextRequest } from './context.js';

const future = new Date(Date.now() + 1000 * 60 * 60 * 24);

function makeReq(headers: ContextRequest['headers']): ContextRequest {
  return { headers };
}

beforeEach(() => {
  mockSessionFindUnique.mockReset();
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
    expect(mockSessionFindUnique).not.toHaveBeenCalled();
  });

  it('preserves the supplied X-Request-Id', async () => {
    const ctx = await buildContext(
      makeReq({ 'x-request-id': 'req-fixed-123' }),
    );
    expect(ctx.requestId).toBe('req-fixed-123');
  });

  it('returns anonymous when authenticated but no tenant header', async () => {
    mockSessionFindUnique.mockResolvedValueOnce({
      userId: 'user-1',
      sessionToken: 'tok',
      expires: future,
    });
    const ctx = await buildContext(
      makeReq({ cookie: 'authjs.session-token=tok' }),
    );
    expect(ctx.auth.kind).toBe('anonymous');
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });

  it('returns anonymous when tenant slug does not match', async () => {
    mockSessionFindUnique.mockResolvedValueOnce({
      userId: 'user-1',
      sessionToken: 'tok',
      expires: future,
    });
    mockTenantFindUnique.mockResolvedValueOnce(null);
    const ctx = await buildContext(
      makeReq({
        cookie: 'authjs.session-token=tok',
        'x-tenant-slug': 'unknown',
      }),
    );
    expect(ctx.auth.kind).toBe('anonymous');
  });

  it('returns anonymous when user has no membership in the tenant', async () => {
    mockSessionFindUnique.mockResolvedValueOnce({
      userId: 'user-1',
      sessionToken: 'tok',
      expires: future,
    });
    mockTenantFindUnique.mockResolvedValueOnce({
      id: 'tenant-1',
      slug: 'acme',
    });
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    const ctx = await buildContext(
      makeReq({ cookie: 'authjs.session-token=tok', 'x-tenant-slug': 'acme' }),
    );
    expect(ctx.auth.kind).toBe('anonymous');
  });

  it('returns authenticated context for tenant-wide membership (location null)', async () => {
    mockSessionFindUnique.mockResolvedValueOnce({
      userId: 'user-1',
      sessionToken: 'tok',
      expires: future,
    });
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
    const ctx = await buildContext(
      makeReq({ cookie: 'authjs.session-token=tok', 'x-tenant-slug': 'acme' }),
    );
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
    mockSessionFindUnique.mockResolvedValueOnce({
      userId: 'user-1',
      sessionToken: 'tok',
      expires: future,
    });
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
    const ctx = await buildContext(
      makeReq({
        cookie: 'authjs.session-token=tok',
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
