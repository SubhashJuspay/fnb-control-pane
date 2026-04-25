import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCategoryFindMany } = vi.hoisted(() => ({
  mockCategoryFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    category: { findMany: mockCategoryFindMany },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { resolveCatalogCategories } from './category.js';
import { buildSchema } from './index.js';

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
      category: { findMany: mockCategoryFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => mockCategoryFindMany.mockReset());

describe('Category type', () => {
  it('is registered in the schema', () => {
    const schema = buildSchema();
    expect(schema.getType('Category')).toBeTruthy();
  });
});

describe('resolveCatalogCategories', () => {
  it('throws ForbiddenError for anonymous viewers', async () => {
    await expect(
      resolveCatalogCategories({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockCategoryFindMany).not.toHaveBeenCalled();
  });

  it('returns categories scoped to the current tenant (excludes archived)', async () => {
    mockCategoryFindMany.mockResolvedValueOnce([
      { id: 'c-1' },
      { id: 'c-2' },
    ]);
    const result = await resolveCatalogCategories(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-9', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
    );
    expect(result).toHaveLength(2);
    const call = mockCategoryFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ tenantId: 't-9', archivedAt: null });
  });

  it('cross-tenant returns empty (different tenantId)', async () => {
    mockCategoryFindMany.mockResolvedValueOnce([]);
    const result = await resolveCatalogCategories(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-other', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
    );
    expect(result).toEqual([]);
    const call = mockCategoryFindMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('t-other');
  });
});
