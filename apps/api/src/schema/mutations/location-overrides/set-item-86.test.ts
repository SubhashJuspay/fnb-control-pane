import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMenuItemFindFirst, mockUpsert, mockAuditCreate } = vi.hoisted(() => ({
  mockMenuItemFindFirst: vi.fn(),
  mockUpsert: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuItem: { findFirst: mockMenuItemFindFirst },
    locationItem: { upsert: mockUpsert },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveSetItem86 } from './set-item-86.js';

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
      locationItem: { upsert: mockUpsert },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuItemFindFirst.mockReset();
  mockUpsert.mockReset();
  mockAuditCreate.mockReset();
});

const staffCtx = (
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
    role: 'STAFF',
  });

describe('resolveSetItem86', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveSetItem86(
        {},
        { menuItemId: 'mi-1', available: false },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects VIEWER', async () => {
    await expect(
      resolveSetItem86(
        {},
        { menuItemId: 'mi-1', available: false },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
          role: 'VIEWER',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-location bleed: ADMIN with no location context throws ForbiddenError', async () => {
    // OWNER/ADMIN have tenant-wide scope; the staff scope-auth would let them
    // through, but the resolver enforces a location must be present.
    const adminNoLoc = ctxFor({
      kind: 'authenticated',
      user: { id: 'u-1', email: 'u@t' },
      tenant: { id: 't-1', slug: 't' },
      location: null,
      role: 'ADMIN',
    });
    await expect(
      resolveSetItem86({}, { menuItemId: 'mi-1', available: false }, adminNoLoc),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant: rejects if menuItem belongs to another tenant', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveSetItem86(
        {},
        { menuItemId: 'mi-other', available: false },
        staffCtx('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy: upsert sets only available field, writes audit', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockUpsert.mockResolvedValueOnce({ id: 'li-1' });
    await resolveSetItem86({}, { menuItemId: 'mi-1', available: false }, staffCtx());
    const args = mockUpsert.mock.calls[0]?.[0];
    expect(args.create).toEqual({
      locationId: 'loc-1',
      menuItemId: 'mi-1',
      available: false,
    });
    expect(args.update).toEqual({ available: false });
    // critically, neither `hidden` nor `priceCents` ever appear
    expect(args.update.hidden).toBeUndefined();
    expect(args.update.priceCents).toBeUndefined();
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'location.item.86_toggled',
    );
    expect(mockAuditCreate.mock.calls[0]?.[0].data.metadata).toEqual({
      menuItemId: 'mi-1',
      available: false,
    });
  });

  it('round-trips: STAFF can toggle back to true', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockUpsert.mockResolvedValueOnce({ id: 'li-1' });
    await resolveSetItem86({}, { menuItemId: 'mi-1', available: true }, staffCtx());
    expect(mockUpsert.mock.calls[0]?.[0].update).toEqual({ available: true });
  });
});
