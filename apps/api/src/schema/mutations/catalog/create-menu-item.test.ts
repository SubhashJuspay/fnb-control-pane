import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCategoryFindFirst,
  mockTaxCategoryFindFirst,
  mockMenuItemCreate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockCategoryFindFirst: vi.fn(),
  mockTaxCategoryFindFirst: vi.fn(),
  mockMenuItemCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    category: { findFirst: mockCategoryFindFirst },
    taxCategory: { findFirst: mockTaxCategoryFindFirst },
    menuItem: { create: mockMenuItemCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveCreateMenuItem } from './create-menu-item.js';

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
      category: { findFirst: mockCategoryFindFirst },
      taxCategory: { findFirst: mockTaxCategoryFindFirst },
      menuItem: { create: mockMenuItemCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockCategoryFindFirst.mockReset();
  mockTaxCategoryFindFirst.mockReset();
  mockMenuItemCreate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveCreateMenuItem', () => {
  it('rejects STAFF role with ForbiddenError', async () => {
    await expect(
      resolveCreateMenuItem(
        {},
        { name: 'Burger', basePriceCents: 1000, taxCategoryId: 'tc-1' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: null,
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockMenuItemCreate).not.toHaveBeenCalled();
  });

  it('rejects anonymous viewers', async () => {
    await expect(
      resolveCreateMenuItem(
        {},
        { name: 'Burger', basePriceCents: 1000, taxCategoryId: 'tc-1' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('happy path creates item, validates references, writes audit', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce({ id: 'tc-1' });
    mockCategoryFindFirst.mockResolvedValueOnce({ id: 'cat-1' });
    mockMenuItemCreate.mockResolvedValueOnce({ id: 'mi-1' });
    const result = await resolveCreateMenuItem(
      {},
      {
        name: 'Burger',
        basePriceCents: 1099,
        taxCategoryId: 'tc-1',
        categoryId: 'cat-1',
        course: 'MAIN',
      },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-9', slug: 't' },
        location: null,
        role: 'OWNER',
      }),
    );
    expect(result).toEqual({ id: 'mi-1' });
    const createCall = mockMenuItemCreate.mock.calls[0]?.[0];
    expect(createCall.data.tenantId).toBe('t-9');
    expect(createCall.data.basePriceCents).toBe(1099);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: 'catalog.item.created',
      resourceType: 'menu_item',
      resourceId: 'mi-1',
    });
  });

  it('cross-tenant: rejects if taxCategory belongs to a different tenant', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveCreateMenuItem(
        {},
        { name: 'Burger', basePriceCents: 1000, taxCategoryId: 'tc-other' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-A', slug: 't' },
          location: null,
          role: 'ADMIN',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockMenuItemCreate).not.toHaveBeenCalled();
    const findCall = mockTaxCategoryFindFirst.mock.calls[0]?.[0];
    expect(findCall.where).toEqual({ id: 'tc-other', tenantId: 't-A' });
  });

  it('cross-tenant: rejects if categoryId belongs to a different tenant', async () => {
    mockCategoryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveCreateMenuItem(
        {},
        {
          name: 'Burger',
          basePriceCents: 1000,
          taxCategoryId: 'tc-1',
          categoryId: 'cat-other',
        },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-A', slug: 't' },
          location: null,
          role: 'ADMIN',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockMenuItemCreate).not.toHaveBeenCalled();
  });
});
