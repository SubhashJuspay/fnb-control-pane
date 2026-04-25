import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTenantFindMany, mockMembershipFindMany, mockLocationFindMany } = vi.hoisted(() => ({
  mockTenantFindMany: vi.fn(),
  mockMembershipFindMany: vi.fn(),
  mockLocationFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    tenant: { findMany: mockTenantFindMany },
    membership: { findMany: mockMembershipFindMany },
    location: { findMany: mockLocationFindMany },
  },
}));

import type { RequestContext } from '../context.js';
import { buildSchema } from './index.js';
import { resolveMyTenants, resolveTenantLocations } from './tenant.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

function anonCtx(): RequestContext {
  return {
    auth: { kind: 'anonymous' },
    prisma: {
      tenant: { findMany: mockTenantFindMany },
      membership: { findMany: mockMembershipFindMany },
      location: { findMany: mockLocationFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

function authedCtx(opts: {
  userId: string;
  tenantId: string;
  role?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
}): RequestContext {
  return {
    auth: {
      kind: 'authenticated',
      user: { id: opts.userId, email: 'u@test' },
      tenant: { id: opts.tenantId, slug: 'tenant' },
      location: null,
      role: opts.role ?? 'OWNER',
    },
    prisma: {
      tenant: { findMany: mockTenantFindMany },
      membership: { findMany: mockMembershipFindMany },
      location: { findMany: mockLocationFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockTenantFindMany.mockReset();
  mockMembershipFindMany.mockReset();
  mockLocationFindMany.mockReset();
});

describe('schema build', () => {
  it('compiles without runtime errors and exposes Query.myTenants + Tenant.locations', () => {
    const schema = buildSchema();
    const queryType = schema.getQueryType();
    expect(queryType).toBeTruthy();
    const fields = queryType?.getFields();
    expect(fields).toHaveProperty('myTenants');
    const tenantType = schema.getType('Tenant');
    expect(tenantType).toBeTruthy();
    // The Tenant type must expose `locations`.
    const tenantFields = (
      tenantType as unknown as {
        getFields: () => Record<string, unknown>;
      }
    ).getFields();
    expect(tenantFields).toHaveProperty('locations');
  });

  it('does NOT expose a Query._placeholder field once domain modules land', () => {
    const schema = buildSchema();
    const fields = schema.getQueryType()?.getFields() ?? {};
    expect(fields).not.toHaveProperty('_placeholder');
  });
});

describe('resolveMyTenants', () => {
  it('returns empty array for anonymous viewer', async () => {
    const result = await resolveMyTenants({}, anonCtx());
    expect(result).toEqual([]);
    expect(mockTenantFindMany).not.toHaveBeenCalled();
  });

  it('returns tenants for authenticated viewer scoped to their userId', async () => {
    mockTenantFindMany.mockResolvedValueOnce([
      { id: 't-1', name: 'Acme', slug: 'acme', status: 'ACTIVE', createdAt: new Date() },
    ]);
    const result = await resolveMyTenants({}, authedCtx({ userId: 'u-1', tenantId: 't-1' }));
    expect(result).toHaveLength(1);
    expect(mockTenantFindMany).toHaveBeenCalledTimes(1);
    const call = mockTenantFindMany.mock.calls[0]?.[0];
    expect(call.where).toMatchObject({
      status: 'ACTIVE',
      memberships: { some: { userId: 'u-1', status: 'ACTIVE' } },
    });
    expect(call.orderBy).toEqual({ name: 'asc' });
  });

  it('passes through Pothos query include/select fragment', async () => {
    mockTenantFindMany.mockResolvedValueOnce([]);
    const fragment = { include: { locations: true } };
    await resolveMyTenants(fragment, authedCtx({ userId: 'u-1', tenantId: 't-1' }));
    const call = mockTenantFindMany.mock.calls[0]?.[0];
    expect(call.include).toEqual({ locations: true });
  });
});

describe('resolveTenantLocations', () => {
  it('returns empty array for anonymous viewer', async () => {
    const result = await resolveTenantLocations({}, { id: 't-1' }, anonCtx());
    expect(result).toEqual([]);
    expect(mockMembershipFindMany).not.toHaveBeenCalled();
  });

  it('returns empty when viewer has no membership in the tenant', async () => {
    mockMembershipFindMany.mockResolvedValueOnce([]);
    const result = await resolveTenantLocations(
      {},
      { id: 't-1' },
      authedCtx({ userId: 'u-1', tenantId: 't-1' }),
    );
    expect(result).toEqual([]);
    expect(mockLocationFindMany).not.toHaveBeenCalled();
  });

  it('returns ALL non-archived locations when membership is tenant-wide (locationId IS NULL)', async () => {
    mockMembershipFindMany.mockResolvedValueOnce([{ locationId: null }]);
    mockLocationFindMany.mockResolvedValueOnce([{ id: 'l-1' }, { id: 'l-2' }]);
    await resolveTenantLocations({}, { id: 't-1' }, authedCtx({ userId: 'u-1', tenantId: 't-1' }));
    expect(mockLocationFindMany).toHaveBeenCalledTimes(1);
    const call = mockLocationFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({
      tenantId: 't-1',
      status: { not: 'ARCHIVED' },
    });
  });

  it('returns SCOPED locations when membership is location-scoped', async () => {
    mockMembershipFindMany.mockResolvedValueOnce([{ locationId: 'l-9' }, { locationId: 'l-7' }]);
    mockLocationFindMany.mockResolvedValueOnce([{ id: 'l-9' }, { id: 'l-7' }]);
    await resolveTenantLocations({}, { id: 't-1' }, authedCtx({ userId: 'u-1', tenantId: 't-1' }));
    const call = mockLocationFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({
      id: { in: ['l-9', 'l-7'] },
      status: { not: 'ARCHIVED' },
    });
  });

  it('respects the __userId side-channel for tenantless viewers', async () => {
    mockMembershipFindMany.mockResolvedValueOnce([{ locationId: null }]);
    mockLocationFindMany.mockResolvedValueOnce([]);
    const ctx = anonCtx() as RequestContext & { __userId?: string };
    ctx.__userId = 'u-side';
    await resolveTenantLocations({}, { id: 't-1' }, ctx);
    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: { userId: 'u-side', tenantId: 't-1', status: 'ACTIVE' },
      select: { locationId: true },
    });
  });
});
