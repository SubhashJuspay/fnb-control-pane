import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMenuFindFirst,
  mockSectionFindMany,
  mockSectionUpdate,
  mockTransaction,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockMenuFindFirst: vi.fn(),
  mockSectionFindMany: vi.fn(),
  mockSectionUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menu: { findFirst: mockMenuFindFirst },
    menuSection: { findMany: mockSectionFindMany, update: mockSectionUpdate },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveReorderMenuSections } from './reorder-menu-sections.js';

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
      menu: { findFirst: mockMenuFindFirst },
      menuSection: { findMany: mockSectionFindMany, update: mockSectionUpdate },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuFindFirst.mockReset();
  mockSectionFindMany.mockReset();
  mockSectionUpdate.mockReset();
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

describe('resolveReorderMenuSections', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveReorderMenuSections(
        { menuId: 'm-1', orderedIds: ['a'] },
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

  it('NotFound when menu cross-location', async () => {
    mockMenuFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveReorderMenuSections(
        { menuId: 'm-other', orderedIds: ['a'] },
        managerCtx('loc-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy: validates ids, runs transaction', async () => {
    mockMenuFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockSectionFindMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    mockSectionUpdate.mockReturnValue('promise');
    mockTransaction.mockResolvedValueOnce(['promise', 'promise']);
    const result = await resolveReorderMenuSections(
      { menuId: 'm-1', orderedIds: ['b', 'a'] },
      managerCtx(),
    );
    expect(result.ids).toEqual(['b', 'a']);
    expect(mockSectionUpdate.mock.calls[0]?.[0].where.id).toBe('b');
    expect(mockSectionUpdate.mock.calls[0]?.[0].data.sortOrder).toBe(0);
    expect(mockSectionUpdate.mock.calls[1]?.[0].data.sortOrder).toBe(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });
});
