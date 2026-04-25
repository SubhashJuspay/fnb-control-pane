import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindFirst, mockUpdate, mockAuditCreate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuSectionItem: { findFirst: mockFindFirst, update: mockUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveUpdateMenuSectionItem } from './update-menu-section-item.js';

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
      menuSectionItem: { findFirst: mockFindFirst, update: mockUpdate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockFindFirst.mockReset();
  mockUpdate.mockReset();
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

describe('resolveUpdateMenuSectionItem', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateMenuSectionItem(
        {},
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
      resolveUpdateMenuSectionItem({}, { id: 's-x' }, managerCtx('loc-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates priceOverrideCents when present in input keys', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveUpdateMenuSectionItem(
      {},
      { id: 's-1', priceOverrideCents: 250 },
      managerCtx(),
      new Set(['id', 'priceOverrideCents']),
    );
    expect(mockUpdate.mock.calls[0]?.[0].data).toEqual({ priceOverrideCents: 250 });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'menu.section.item_updated',
    );
  });

  it('explicit null priceOverrideCents clears the override', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveUpdateMenuSectionItem(
      {},
      { id: 's-1', priceOverrideCents: null },
      managerCtx(),
      new Set(['id', 'priceOverrideCents']),
    );
    expect(mockUpdate.mock.calls[0]?.[0].data).toEqual({ priceOverrideCents: null });
  });

  it('omitted priceOverrideCents leaves the row unchanged', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveUpdateMenuSectionItem(
      {},
      { id: 's-1' },
      managerCtx(),
      new Set(['id']),
    );
    expect(mockUpdate.mock.calls[0]?.[0].data).toEqual({});
  });
});
