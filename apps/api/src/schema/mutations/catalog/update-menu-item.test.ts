import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMenuItemFindFirst,
  mockMenuItemUpdate,
  mockCategoryFindFirst,
  mockTaxCategoryFindFirst,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockMenuItemFindFirst: vi.fn(),
  mockMenuItemUpdate: vi.fn(),
  mockCategoryFindFirst: vi.fn(),
  mockTaxCategoryFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuItem: { findFirst: mockMenuItemFindFirst, update: mockMenuItemUpdate },
    category: { findFirst: mockCategoryFindFirst },
    taxCategory: { findFirst: mockTaxCategoryFindFirst },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveUpdateMenuItem } from './update-menu-item.js';

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
      menuItem: { findFirst: mockMenuItemFindFirst, update: mockMenuItemUpdate },
      category: { findFirst: mockCategoryFindFirst },
      taxCategory: { findFirst: mockTaxCategoryFindFirst },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuItemFindFirst.mockReset();
  mockMenuItemUpdate.mockReset();
  mockCategoryFindFirst.mockReset();
  mockTaxCategoryFindFirst.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveUpdateMenuItem', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateMenuItem(
        {},
        { id: 'mi-1', name: 'X' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: null,
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('happy path updates fields and writes audit', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockMenuItemUpdate.mockResolvedValueOnce({ id: 'mi-1' });
    const result = await resolveUpdateMenuItem(
      {},
      { id: 'mi-1', name: 'Renamed', basePriceCents: 1500 },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-1', slug: 't' },
        location: null,
        role: 'ADMIN',
      }),
    );
    expect(result).toEqual({ id: 'mi-1' });
    expect(mockMenuItemUpdate.mock.calls[0]?.[0].data).toEqual({
      name: 'Renamed',
      basePriceCents: 1500,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.item.updated');
  });

  it('cross-tenant lookup raises NotFoundError', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateMenuItem(
        {},
        { id: 'mi-other', name: 'X' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-A', slug: 't' },
          location: null,
          role: 'ADMIN',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
