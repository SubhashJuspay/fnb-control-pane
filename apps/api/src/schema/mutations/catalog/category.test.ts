import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCategoryFindFirst,
  mockCategoryFindMany,
  mockCategoryCreate,
  mockCategoryUpdate,
  mockTransaction,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockCategoryFindFirst: vi.fn(),
  mockCategoryFindMany: vi.fn(),
  mockCategoryCreate: vi.fn(),
  mockCategoryUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    category: {
      findFirst: mockCategoryFindFirst,
      findMany: mockCategoryFindMany,
      create: mockCategoryCreate,
      update: mockCategoryUpdate,
    },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveArchiveCategory } from './archive-category.js';
import { resolveCreateCategory } from './create-category.js';
import { resolveReorderCategories } from './reorder-categories.js';
import { resolveUpdateCategory } from './update-category.js';

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
      category: {
        findFirst: mockCategoryFindFirst,
        findMany: mockCategoryFindMany,
        create: mockCategoryCreate,
        update: mockCategoryUpdate,
      },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockCategoryFindFirst.mockReset();
  mockCategoryFindMany.mockReset();
  mockCategoryCreate.mockReset();
  mockCategoryUpdate.mockReset();
  mockTransaction.mockReset();
  mockAuditCreate.mockReset();
});

const admin = (tid = 't-1') =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: tid, slug: 't' },
    location: null,
    role: 'ADMIN',
  });

const staff = (tid = 't-1') =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: tid, slug: 't' },
    location: null,
    role: 'STAFF',
  });

describe('resolveCreateCategory', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveCreateCategory({}, { name: 'Apps', slug: 'apps' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('happy path creates and writes audit', async () => {
    mockCategoryFindFirst.mockResolvedValueOnce(null);
    mockCategoryCreate.mockResolvedValueOnce({ id: 'cat-1' });
    await resolveCreateCategory({}, { name: 'Apps', slug: 'apps' }, admin('t-9'));
    expect(mockCategoryCreate.mock.calls[0]?.[0].data).toMatchObject({
      tenantId: 't-9',
      name: 'Apps',
      slug: 'apps',
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.category.created');
  });

  it('throws ConflictError on duplicate slug', async () => {
    mockCategoryFindFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(
      resolveCreateCategory({}, { name: 'Apps', slug: 'apps' }, admin()),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockCategoryCreate).not.toHaveBeenCalled();
  });
});

describe('resolveUpdateCategory', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateCategory({}, { id: 'c-1', name: 'New' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant returns NotFound', async () => {
    mockCategoryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateCategory({}, { id: 'c-other', name: 'X' }, admin('t-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path updates name', async () => {
    mockCategoryFindFirst.mockResolvedValueOnce({ id: 'c-1', slug: 'apps' });
    mockCategoryUpdate.mockResolvedValueOnce({ id: 'c-1' });
    await resolveUpdateCategory({}, { id: 'c-1', name: 'Renamed' }, admin('t-9'));
    expect(mockCategoryUpdate.mock.calls[0]?.[0].data).toEqual({ name: 'Renamed' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.category.updated');
  });
});

describe('resolveReorderCategories', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveReorderCategories({ orderedIds: ['c-1'] }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant ids → NotFoundError (count mismatch)', async () => {
    mockCategoryFindMany.mockResolvedValueOnce([{ id: 'c-1' }]);
    await expect(
      resolveReorderCategories({ orderedIds: ['c-1', 'c-other'] }, admin('t-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('happy path runs a transaction with sortOrder updates', async () => {
    mockCategoryFindMany.mockResolvedValueOnce([{ id: 'c-1' }, { id: 'c-2' }]);
    mockTransaction.mockResolvedValueOnce([{ id: 'c-1' }, { id: 'c-2' }]);
    const result = await resolveReorderCategories(
      { orderedIds: ['c-2', 'c-1'] },
      admin('t-9'),
    );
    expect(result).toEqual({ ids: ['c-2', 'c-1'] });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.category.updated');
  });
});

describe('resolveArchiveCategory', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveArchiveCategory({}, { id: 'c-1' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant id returns NotFound', async () => {
    mockCategoryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveArchiveCategory({}, { id: 'c-other' }, admin('t-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('archives and writes audit', async () => {
    mockCategoryFindFirst.mockResolvedValueOnce({ id: 'c-1' });
    mockCategoryUpdate.mockResolvedValueOnce({ id: 'c-1' });
    await resolveArchiveCategory({}, { id: 'c-1' }, admin('t-1'));
    expect(mockCategoryUpdate.mock.calls[0]?.[0].data.archivedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.category.archived');
  });
});
