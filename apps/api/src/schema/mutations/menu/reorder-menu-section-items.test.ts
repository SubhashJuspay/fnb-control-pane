import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSectionFindFirst,
  mockSectionItemFindMany,
  mockSectionItemUpdate,
  mockTransaction,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockSectionFindFirst: vi.fn(),
  mockSectionItemFindMany: vi.fn(),
  mockSectionItemUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuSection: { findFirst: mockSectionFindFirst },
    menuSectionItem: {
      findMany: mockSectionItemFindMany,
      update: mockSectionItemUpdate,
    },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveReorderMenuSectionItems } from './reorder-menu-section-items.js';

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
      menuSection: { findFirst: mockSectionFindFirst },
      menuSectionItem: {
        findMany: mockSectionItemFindMany,
        update: mockSectionItemUpdate,
      },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockSectionFindFirst.mockReset();
  mockSectionItemFindMany.mockReset();
  mockSectionItemUpdate.mockReset();
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

describe('resolveReorderMenuSectionItems', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveReorderMenuSectionItems(
        { menuSectionId: 's-1', orderedIds: ['a'] },
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

  it('NotFound when section in another location', async () => {
    mockSectionFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveReorderMenuSectionItems(
        { menuSectionId: 's-x', orderedIds: ['a'] },
        managerCtx('loc-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy: applies new sortOrders in transaction', async () => {
    mockSectionFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockSectionItemFindMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    mockSectionItemUpdate.mockReturnValue('p');
    mockTransaction.mockResolvedValueOnce(['p', 'p']);
    const result = await resolveReorderMenuSectionItems(
      { menuSectionId: 's-1', orderedIds: ['b', 'a'] },
      managerCtx(),
    );
    expect(result.ids).toEqual(['b', 'a']);
    expect(mockSectionItemUpdate.mock.calls[0]?.[0].data.sortOrder).toBe(0);
    expect(mockSectionItemUpdate.mock.calls[1]?.[0].data.sortOrder).toBe(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });
});
