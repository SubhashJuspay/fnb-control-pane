import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockModifierGroupFindFirst,
  mockModifierFindFirst,
  mockModifierFindMany,
  mockModifierCreate,
  mockModifierUpdate,
  mockTransaction,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockModifierGroupFindFirst: vi.fn(),
  mockModifierFindFirst: vi.fn(),
  mockModifierFindMany: vi.fn(),
  mockModifierCreate: vi.fn(),
  mockModifierUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    modifierGroup: { findFirst: mockModifierGroupFindFirst },
    modifier: {
      findFirst: mockModifierFindFirst,
      findMany: mockModifierFindMany,
      create: mockModifierCreate,
      update: mockModifierUpdate,
    },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveAddModifier } from './add-modifier.js';
import { resolveArchiveModifier } from './archive-modifier.js';
import { resolveReorderModifiers } from './reorder-modifiers.js';
import { resolveUpdateModifier } from './update-modifier.js';

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
      modifierGroup: { findFirst: mockModifierGroupFindFirst },
      modifier: {
        findFirst: mockModifierFindFirst,
        findMany: mockModifierFindMany,
        create: mockModifierCreate,
        update: mockModifierUpdate,
      },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockModifierGroupFindFirst.mockReset();
  mockModifierFindFirst.mockReset();
  mockModifierFindMany.mockReset();
  mockModifierCreate.mockReset();
  mockModifierUpdate.mockReset();
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

const staff = () =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: null,
    role: 'STAFF',
  });

describe('resolveAddModifier', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveAddModifier({}, { modifierGroupId: 'mg-1', name: 'Cheese' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant group lookup → NotFound', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveAddModifier(
        {},
        { modifierGroupId: 'mg-other', name: 'Cheese' },
        admin('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path appends modifier and writes audit', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce({ id: 'mg-1' });
    mockModifierFindFirst.mockResolvedValueOnce({ sortOrder: 2 });
    mockModifierCreate.mockResolvedValueOnce({ id: 'm-1' });
    await resolveAddModifier(
      {},
      { modifierGroupId: 'mg-1', name: 'Cheese', priceDeltaCents: 100 },
      admin(),
    );
    expect(mockModifierCreate.mock.calls[0]?.[0].data).toMatchObject({
      modifierGroupId: 'mg-1',
      name: 'Cheese',
      priceDeltaCents: 100,
      sortOrder: 3,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.modifier.added');
  });
});

describe('resolveUpdateModifier', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateModifier({}, { id: 'm-1', name: 'X' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant lookup returns NotFound', async () => {
    mockModifierFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateModifier({}, { id: 'm-other', name: 'X' }, admin('t-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path updates and writes audit', async () => {
    mockModifierFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockModifierUpdate.mockResolvedValueOnce({ id: 'm-1' });
    await resolveUpdateModifier(
      {},
      { id: 'm-1', name: 'New', priceDeltaCents: 50 },
      admin(),
    );
    expect(mockModifierUpdate.mock.calls[0]?.[0].data).toEqual({
      name: 'New',
      priceDeltaCents: 50,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.modifier.updated');
  });
});

describe('resolveReorderModifiers', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveReorderModifiers(
        { modifierGroupId: 'mg-1', orderedIds: ['m-1'] },
        staff(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant group lookup → NotFound', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveReorderModifiers(
        { modifierGroupId: 'mg-other', orderedIds: ['m-1'] },
        admin('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path runs $transaction', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce({ id: 'mg-1' });
    mockModifierFindMany.mockResolvedValueOnce([{ id: 'm-1' }, { id: 'm-2' }]);
    mockTransaction.mockResolvedValueOnce([]);
    const result = await resolveReorderModifiers(
      { modifierGroupId: 'mg-1', orderedIds: ['m-2', 'm-1'] },
      admin(),
    );
    expect(result).toEqual({ ids: ['m-2', 'm-1'] });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('resolveArchiveModifier', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveArchiveModifier({}, { id: 'm-1' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('archives and writes audit', async () => {
    mockModifierFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockModifierUpdate.mockResolvedValueOnce({ id: 'm-1' });
    await resolveArchiveModifier({}, { id: 'm-1' }, admin());
    expect(mockModifierUpdate.mock.calls[0]?.[0].data.archivedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.modifier.archived');
  });
});
