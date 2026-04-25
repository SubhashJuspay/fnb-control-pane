import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTaxCategoryFindMany,
  mockLocationFindFirst,
  mockTaxRateFindMany,
} = vi.hoisted(() => ({
  mockTaxCategoryFindMany: vi.fn(),
  mockLocationFindFirst: vi.fn(),
  mockTaxRateFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    taxCategory: { findMany: mockTaxCategoryFindMany },
    location: { findFirst: mockLocationFindFirst },
    taxRate: { findMany: mockTaxRateFindMany },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { buildSchema } from './index.js';
import {
  resolveCatalogTaxCategories,
  resolveRatesAtLocation,
} from './tax-category.js';

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
      taxCategory: { findMany: mockTaxCategoryFindMany },
      location: { findFirst: mockLocationFindFirst },
      taxRate: { findMany: mockTaxRateFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockTaxCategoryFindMany.mockReset();
  mockLocationFindFirst.mockReset();
  mockTaxRateFindMany.mockReset();
});

describe('TaxCategory type', () => {
  it('is registered with the kind enum field', () => {
    const schema = buildSchema();
    expect(schema.getType('TaxCategory')).toBeTruthy();
    expect(schema.getType('TaxCategoryKind')).toBeTruthy();
    expect(schema.getType('TaxRate')).toBeTruthy();
  });
});

describe('resolveCatalogTaxCategories', () => {
  it('throws ForbiddenError for anonymous', async () => {
    await expect(
      resolveCatalogTaxCategories({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('is tenant-scoped', async () => {
    mockTaxCategoryFindMany.mockResolvedValueOnce([{ id: 'tc-1' }]);
    await resolveCatalogTaxCategories(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-A', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
    );
    const call = mockTaxCategoryFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ tenantId: 't-A', archivedAt: null });
  });
});

describe('resolveRatesAtLocation', () => {
  it('returns ordered rates for valid location', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'l-1' });
    mockTaxRateFindMany.mockResolvedValueOnce([
      { id: 'tr-2', effectiveFrom: new Date('2026-04-01') },
      { id: 'tr-1', effectiveFrom: new Date('2026-01-01') },
    ]);
    const result = await resolveRatesAtLocation(
      {},
      { id: 'tc-1', tenantId: 't-A' },
      { locationId: 'l-1' },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-A', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
    );
    expect(result).toHaveLength(2);
    const call = mockTaxRateFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ taxCategoryId: 'tc-1', locationId: 'l-1' });
    expect(call.orderBy).toEqual({ effectiveFrom: 'desc' });
  });

  it('cross-tenant location lookup returns empty', async () => {
    mockLocationFindFirst.mockResolvedValueOnce(null);
    const result = await resolveRatesAtLocation(
      {},
      { id: 'tc-1', tenantId: 't-A' },
      { locationId: 'l-from-other-tenant' },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-A', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
    );
    expect(result).toEqual([]);
    expect(mockTaxRateFindMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError for anonymous viewers', async () => {
    await expect(
      resolveRatesAtLocation(
        {},
        { id: 'tc-1', tenantId: 't-A' },
        { locationId: 'l-1' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
