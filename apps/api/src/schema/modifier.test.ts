import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockModifierGroupFindMany,
  mockModifierGroupFindFirst,
  mockLocationModifierFindMany,
} = vi.hoisted(() => ({
  mockModifierGroupFindMany: vi.fn(),
  mockModifierGroupFindFirst: vi.fn(),
  mockLocationModifierFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    modifierGroup: {
      findMany: mockModifierGroupFindMany,
      findFirst: mockModifierGroupFindFirst,
    },
    locationModifier: { findMany: mockLocationModifierFindMany },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { buildSchema } from './index.js';
import {
  resolveCatalogModifierGroup,
  resolveCatalogModifierGroups,
  resolveEffectivePriceDelta,
  resolveModifierAvailability,
} from './modifier.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

function ctxFor(auth: AuthContext): RequestContext {
  return {
    auth,
    prisma: {
      modifierGroup: {
        findMany: mockModifierGroupFindMany,
        findFirst: mockModifierGroupFindFirst,
      },
      locationModifier: { findMany: mockLocationModifierFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockModifierGroupFindMany.mockReset();
  mockModifierGroupFindFirst.mockReset();
  mockLocationModifierFindMany.mockReset();
});

describe('Modifier types are registered', () => {
  it('ModifierGroup and Modifier appear in the schema', () => {
    const schema = buildSchema();
    expect(schema.getType('ModifierGroup')).toBeTruthy();
    expect(schema.getType('Modifier')).toBeTruthy();
  });
});

describe('resolveCatalogModifierGroups', () => {
  it('throws ForbiddenError for anonymous', async () => {
    await expect(
      resolveCatalogModifierGroups({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('is tenant-scoped', async () => {
    mockModifierGroupFindMany.mockResolvedValueOnce([{ id: 'mg-1' }]);
    await resolveCatalogModifierGroups(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-9', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
    );
    const call = mockModifierGroupFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ tenantId: 't-9', archivedAt: null });
  });
});

describe('resolveCatalogModifierGroup', () => {
  it('returns null for cross-tenant lookup', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce(null);
    const result = await resolveCatalogModifierGroup(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-A', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
      'mg-other-tenant',
    );
    expect(result).toBeNull();
    const call = mockModifierGroupFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: 'mg-other-tenant', tenantId: 't-A' });
  });
});

describe('resolveEffectivePriceDelta', () => {
  it('returns base delta for anonymous viewer', async () => {
    expect(
      await resolveEffectivePriceDelta(
        { id: 'mod-1', priceDeltaCents: 50 },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).toBe(50);
  });

  it('uses location override delta when set', async () => {
    mockLocationModifierFindMany.mockResolvedValueOnce([
      {
        id: 'lm-1',
        locationId: 'l-1',
        modifierId: 'mod-1',
        hidden: false,
        available: true,
        priceDeltaOverrideCents: 75,
      },
    ]);
    const result = await resolveEffectivePriceDelta(
      { id: 'mod-1', priceDeltaCents: 50 },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-1', slug: 't' },
        location: { id: 'l-1', timezone: 'UTC', currency: 'USD' },
        role: 'STAFF',
      }),
    );
    expect(result).toBe(75);
  });
});

describe('resolveModifierAvailability', () => {
  it('archived modifier is always unavailable', async () => {
    expect(
      await resolveModifierAvailability(
        { id: 'mod-1', archivedAt: new Date() },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).toBe(false);
  });

  it('hidden override marks unavailable', async () => {
    mockLocationModifierFindMany.mockResolvedValueOnce([
      {
        id: 'lm-1',
        locationId: 'l-1',
        modifierId: 'mod-1',
        hidden: true,
        available: true,
        priceDeltaOverrideCents: null,
      },
    ]);
    const result = await resolveModifierAvailability(
      { id: 'mod-1', archivedAt: null },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-1', slug: 't' },
        location: { id: 'l-1', timezone: 'UTC', currency: 'USD' },
        role: 'STAFF',
      }),
    );
    expect(result).toBe(false);
  });

  it('available=false marks unavailable', async () => {
    mockLocationModifierFindMany.mockResolvedValueOnce([
      {
        id: 'lm-1',
        locationId: 'l-1',
        modifierId: 'mod-1',
        hidden: false,
        available: false,
        priceDeltaOverrideCents: null,
      },
    ]);
    const result = await resolveModifierAvailability(
      { id: 'mod-1', archivedAt: null },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-1', slug: 't' },
        location: { id: 'l-1', timezone: 'UTC', currency: 'USD' },
        role: 'STAFF',
      }),
    );
    expect(result).toBe(false);
  });
});
