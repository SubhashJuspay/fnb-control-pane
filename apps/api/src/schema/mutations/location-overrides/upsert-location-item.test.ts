import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMenuItemFindFirst, mockLocationItemUpsert, mockAuditCreate } = vi.hoisted(() => ({
  mockMenuItemFindFirst: vi.fn(),
  mockLocationItemUpsert: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuItem: { findFirst: mockMenuItemFindFirst },
    locationItem: { upsert: mockLocationItemUpsert },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveUpsertLocationItem } from './upsert-location-item.js';

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
      menuItem: { findFirst: mockMenuItemFindFirst },
      locationItem: { upsert: mockLocationItemUpsert },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuItemFindFirst.mockReset();
  mockLocationItemUpsert.mockReset();
  mockAuditCreate.mockReset();
});

const managerCtx = (
  tenantId = 't-1',
  locationId: string | null = 'loc-1',
): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: tenantId, slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'MANAGER',
  });

describe('resolveUpsertLocationItem', () => {
  it('rejects STAFF (manager-scope only)', async () => {
    await expect(
      resolveUpsertLocationItem(
        {},
        { menuItemId: 'mi-1' },
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

  it('rejects when no location context', async () => {
    await expect(
      resolveUpsertLocationItem(
        {},
        { menuItemId: 'mi-1' },
        managerCtx('t-1', null),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant: rejects if menuItem belongs to another tenant', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpsertLocationItem(
        {},
        { menuItemId: 'mi-other' },
        managerCtx('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockMenuItemFindFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'mi-other',
      tenantId: 't-A',
    });
  });

  it('happy: upsert creates a row with provided fields, writes audit', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockLocationItemUpsert.mockResolvedValueOnce({ id: 'li-1' });
    await resolveUpsertLocationItem(
      {},
      { menuItemId: 'mi-1', priceCents: 500, hidden: false },
      managerCtx(),
      new Set(['menuItemId', 'priceCents', 'hidden']),
    );
    const args = mockLocationItemUpsert.mock.calls[0]?.[0];
    expect(args.where.locationId_menuItemId).toEqual({
      locationId: 'loc-1',
      menuItemId: 'mi-1',
    });
    expect(args.create.priceCents).toBe(500);
    expect(args.create.hidden).toBe(false);
    expect(args.update.priceCents).toBe(500);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'location.item.override_set',
    );
  });

  it('omitted fields are not included in update payload', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockLocationItemUpsert.mockResolvedValueOnce({ id: 'li-1' });
    await resolveUpsertLocationItem(
      {},
      { menuItemId: 'mi-1', priceCents: 500 },
      managerCtx(),
      new Set(['menuItemId', 'priceCents']),
    );
    const args = mockLocationItemUpsert.mock.calls[0]?.[0];
    expect(args.update).toEqual({ priceCents: 500 });
    expect(args.update.hidden).toBeUndefined();
    expect(args.update.available).toBeUndefined();
  });
});
