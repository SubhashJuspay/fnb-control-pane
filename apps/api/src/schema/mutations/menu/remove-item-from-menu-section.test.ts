import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindFirst, mockDelete, mockAuditCreate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockDelete: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuSectionItem: { findFirst: mockFindFirst, delete: mockDelete },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveRemoveItemFromMenuSection } from './remove-item-from-menu-section.js';

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
      menuSectionItem: { findFirst: mockFindFirst, delete: mockDelete },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockFindFirst.mockReset();
  mockDelete.mockReset();
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

describe('resolveRemoveItemFromMenuSection', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveRemoveItemFromMenuSection(
        { id: 's-1' },
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

  it('NotFound for cross-location id', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveRemoveItemFromMenuSection({ id: 's-x' }, managerCtx('loc-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy: deletes, writes audit', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 's-1',
      menuSectionId: 'sec-1',
      menuItemId: 'mi-1',
    });
    mockDelete.mockResolvedValueOnce({ id: 's-1' });
    const result = await resolveRemoveItemFromMenuSection({ id: 's-1' }, managerCtx());
    expect(result).toEqual({ id: 's-1' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'menu.section.item_removed',
    );
  });
});
