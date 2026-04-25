import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMenuFindMany,
  mockMenuUpdate,
  mockTransaction,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockMenuFindMany: vi.fn(),
  mockMenuUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menu: { findMany: mockMenuFindMany, update: mockMenuUpdate },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveReorderMenus } from './reorder-menus.js';

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
      menu: { findMany: mockMenuFindMany, update: mockMenuUpdate },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuFindMany.mockReset();
  mockMenuUpdate.mockReset();
  mockTransaction.mockReset();
  mockAuditCreate.mockReset();
});

const managerCtx = (locationId = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'MANAGER',
  });

describe('resolveReorderMenus', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveReorderMenus(
        { orderedIds: ['a', 'b'] },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('NotFound when an id is in another location', async () => {
    mockMenuFindMany.mockResolvedValueOnce([{ id: 'a' }]); // only one returned
    await expect(
      resolveReorderMenus({ orderedIds: ['a', 'b'] }, managerCtx('loc-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('happy: validates all ids, updates in one transaction, writes audit', async () => {
    mockMenuFindMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    mockMenuUpdate.mockReturnValue('promise-stub');
    mockTransaction.mockResolvedValueOnce(['promise-stub', 'promise-stub']);
    const result = await resolveReorderMenus(
      { orderedIds: ['b', 'a'] },
      managerCtx(),
    );
    expect(result).toEqual({ ids: ['b', 'a'] });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockMenuUpdate).toHaveBeenCalledTimes(2);
    expect(mockMenuUpdate.mock.calls[0]?.[0]).toEqual({
      where: { id: 'b' },
      data: { sortOrder: 0 },
    });
    expect(mockMenuUpdate.mock.calls[1]?.[0]).toEqual({
      where: { id: 'a' },
      data: { sortOrder: 1 },
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('menu.updated');
  });
});
