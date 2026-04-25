import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLocationItemFindMany, mockMenuItemFindFirst, mockMenuItemFindMany } =
  vi.hoisted(() => ({
    mockLocationItemFindMany: vi.fn(),
    mockMenuItemFindFirst: vi.fn(),
    mockMenuItemFindMany: vi.fn(),
  }));

vi.mock('../prisma.js', () => ({
  prisma: {
    locationItem: { findMany: mockLocationItemFindMany },
    menuItem: { findFirst: mockMenuItemFindFirst, findMany: mockMenuItemFindMany },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { buildSchema } from './index.js';
import {
  buildCatalogItemWhere,
  resolveAvailability,
  resolveCatalogItem,
  resolveCatalogItems,
  resolveEffectivePrice,
  type MenuItemRow,
} from './menu-item.js';

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
      locationItem: { findMany: mockLocationItemFindMany },
      menuItem: {
        findFirst: mockMenuItemFindFirst,
        findMany: mockMenuItemFindMany,
      },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockLocationItemFindMany.mockReset();
  mockMenuItemFindFirst.mockReset();
  mockMenuItemFindMany.mockReset();
});

describe('MenuItem type', () => {
  it('is registered with viewer-scoped fields', () => {
    const schema = buildSchema();
    const t = schema.getType('MenuItem') as unknown as {
      getFields: () => Record<string, unknown>;
    };
    const fields = Object.keys(t.getFields());
    for (const f of [
      'id',
      'name',
      'basePriceCents',
      'effectivePriceCents',
      'availableAtViewerLocation',
      'locationOverride',
      'modifierGroups',
    ]) {
      expect(fields).toContain(f);
    }
  });
});

describe('resolveEffectivePrice', () => {
  const parent: MenuItemRow = {
    id: 'mi-1',
    tenantId: 't-1',
    basePriceCents: 1000,
    archivedAt: null,
  };

  it('returns base price for anonymous viewer', async () => {
    expect(await resolveEffectivePrice(parent, ctxFor({ kind: 'anonymous' }))).toBe(1000);
    expect(mockLocationItemFindMany).not.toHaveBeenCalled();
  });

  it('returns base price for authenticated viewer with no location', async () => {
    expect(
      await resolveEffectivePrice(
        parent,
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: null,
          role: 'STAFF',
        }),
      ),
    ).toBe(1000);
  });

  it('uses location override when present', async () => {
    mockLocationItemFindMany.mockResolvedValueOnce([
      {
        id: 'li-1',
        locationId: 'l-1',
        menuItemId: 'mi-1',
        hidden: false,
        available: true,
        priceCents: 1500,
      },
    ]);
    const result = await resolveEffectivePrice(
      parent,
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-1', slug: 't' },
        location: { id: 'l-1', timezone: 'UTC', currency: 'USD' },
        role: 'STAFF',
      }),
    );
    expect(result).toBe(1500);
  });

  it('falls back to base when no override row exists', async () => {
    mockLocationItemFindMany.mockResolvedValueOnce([]);
    const result = await resolveEffectivePrice(
      parent,
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-1', slug: 't' },
        location: { id: 'l-1', timezone: 'UTC', currency: 'USD' },
        role: 'STAFF',
      }),
    );
    expect(result).toBe(1000);
  });
});

describe('resolveAvailability', () => {
  it('archived item is unavailable for anonymous viewer', async () => {
    const parent: MenuItemRow = {
      id: 'mi-2',
      tenantId: 't-1',
      basePriceCents: 0,
      archivedAt: new Date(),
    };
    expect(await resolveAvailability(parent, ctxFor({ kind: 'anonymous' }))).toBe(false);
  });

  it('non-archived item is available for anonymous viewer', async () => {
    const parent: MenuItemRow = {
      id: 'mi-3',
      tenantId: 't-1',
      basePriceCents: 0,
      archivedAt: null,
    };
    expect(await resolveAvailability(parent, ctxFor({ kind: 'anonymous' }))).toBe(true);
  });

  it('hidden override marks item unavailable', async () => {
    mockLocationItemFindMany.mockResolvedValueOnce([
      {
        id: 'li-1',
        locationId: 'l-1',
        menuItemId: 'mi-3',
        hidden: true,
        available: true,
        priceCents: null,
      },
    ]);
    const parent: MenuItemRow = {
      id: 'mi-3',
      tenantId: 't-1',
      basePriceCents: 0,
      archivedAt: null,
    };
    const result = await resolveAvailability(
      parent,
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

describe('buildCatalogItemWhere', () => {
  it('defaults to non-archived', () => {
    expect(buildCatalogItemWhere('t-1', null)).toEqual({
      tenantId: 't-1',
      archivedAt: null,
    });
  });

  it('archivedOnly flag flips to {not:null}', () => {
    expect(buildCatalogItemWhere('t-1', { archivedOnly: true })).toEqual({
      tenantId: 't-1',
      archivedAt: { not: null },
    });
  });

  it('includeArchived flag drops the archivedAt filter', () => {
    expect(buildCatalogItemWhere('t-1', { includeArchived: true })).toEqual({
      tenantId: 't-1',
    });
  });

  it('search uses case-insensitive contains', () => {
    expect(buildCatalogItemWhere('t-1', { search: 'BurGer' })).toEqual({
      tenantId: 't-1',
      archivedAt: null,
      name: { contains: 'BurGer', mode: 'insensitive' },
    });
  });

  it('categoryId narrows the query', () => {
    expect(buildCatalogItemWhere('t-1', { categoryId: 'c-7' })).toEqual({
      tenantId: 't-1',
      archivedAt: null,
      categoryId: 'c-7',
    });
  });
});

describe('resolveCatalogItems', () => {
  it('throws ForbiddenError for anonymous', async () => {
    await expect(
      resolveCatalogItems({}, ctxFor({ kind: 'anonymous' }), null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('scopes to viewer tenant', async () => {
    mockMenuItemFindMany.mockResolvedValueOnce([{ id: 'mi-1' }]);
    await resolveCatalogItems(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-A', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
      null,
    );
    const call = mockMenuItemFindMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('t-A');
  });
});

describe('resolveCatalogItem', () => {
  it('looks up by id AND tenantId (cross-tenant safe)', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    const result = await resolveCatalogItem(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-A', slug: 't' },
        location: null,
        role: 'MANAGER',
      }),
      'mi-from-other-tenant',
    );
    expect(result).toBeNull();
    const call = mockMenuItemFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: 'mi-from-other-tenant', tenantId: 't-A' });
  });
});
