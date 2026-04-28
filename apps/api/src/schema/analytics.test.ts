import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLocationFindUnique,
  mockTicketFindMany,
  mockTicketItemFindMany,
} = vi.hoisted(() => ({
  mockLocationFindUnique: vi.fn(),
  mockTicketFindMany: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    location: { findUnique: mockLocationFindUnique },
    ticket: { findMany: mockTicketFindMany },
    ticketItem: { findMany: mockTicketItemFindMany },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { clearCache } from '../cache.js';
import {
  resolveDayOfWeekMix,
  resolveGuestCohort,
  resolveHourlyMix,
  resolveSalesSummary,
  resolveServerPerformance,
  resolveTopItems,
} from './analytics.js';

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
      location: { findUnique: mockLocationFindUnique },
      ticket: { findMany: mockTicketFindMany },
      ticketItem: { findMany: mockTicketItemFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'MANAGER',
});

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'STAFF',
});

const range = {
  from: new Date('2026-04-26T00:00:00Z'),
  to: new Date('2026-04-26T00:00:00Z'),
};

beforeEach(() => {
  clearCache();
  mockLocationFindUnique.mockReset();
  mockTicketFindMany.mockReset();
  mockTicketItemFindMany.mockReset();
  mockLocationFindUnique.mockResolvedValue({
    timezone: 'America/Los_Angeles',
    businessDayCutoff: '04:00',
  });
});

afterEach(() => {
  clearCache();
});

describe('resolveSalesSummary', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveSalesSummary(ctxFor({ kind: 'anonymous' }), range),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects STAFF', async () => {
    await expect(resolveSalesSummary(staffCtx, range)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('aggregates closed tickets and exposes range', async () => {
    mockTicketFindMany.mockResolvedValueOnce([
      {
        status: 'CLOSED',
        subtotalCents: 1000,
        discountCents: 100,
        taxCents: 80,
        totalCents: 980,
        guestId: 'g-1',
      },
      {
        status: 'CLOSED',
        subtotalCents: 500,
        discountCents: 0,
        taxCents: 40,
        totalCents: 540,
        guestId: null,
      },
    ]);
    const out = await resolveSalesSummary(managerCtx, range);
    expect(out.closedTicketCount).toBe(2);
    expect(out.netSalesCents).toBe(1520);
    expect(out.fromDate).toBe(range.from);
  });

  it('caches the result on second invocation', async () => {
    mockTicketFindMany.mockResolvedValue([]);
    await resolveSalesSummary(managerCtx, range);
    await resolveSalesSummary(managerCtx, range);
    expect(mockTicketFindMany).toHaveBeenCalledTimes(1);
  });

  it('different range = separate cache entry', async () => {
    mockTicketFindMany.mockResolvedValue([]);
    await resolveSalesSummary(managerCtx, range);
    await resolveSalesSummary(managerCtx, {
      from: new Date('2026-04-27T00:00:00Z'),
      to: new Date('2026-04-27T00:00:00Z'),
    });
    expect(mockTicketFindMany).toHaveBeenCalledTimes(2);
  });

  it('clearCache() between calls forces re-fetch', async () => {
    mockTicketFindMany.mockResolvedValue([]);
    await resolveSalesSummary(managerCtx, range);
    clearCache();
    await resolveSalesSummary(managerCtx, range);
    expect(mockTicketFindMany).toHaveBeenCalledTimes(2);
  });
});

describe('resolveTopItems', () => {
  it('clamps limit and passes results through computeTopItems', async () => {
    mockTicketItemFindMany.mockResolvedValueOnce([
      {
        ticketId: 'tk-1',
        menuItemId: 'mi-1',
        nameSnapshot: 'Latte',
        quantity: 3,
        lineSubtotalCents: 1350,
        status: 'SERVED',
        menuItem: { name: 'Latte' },
        discounts: [{ computedCents: 100 }],
      },
      {
        ticketId: 'tk-2',
        menuItemId: 'mi-2',
        nameSnapshot: 'Croissant',
        quantity: 1,
        lineSubtotalCents: 350,
        status: 'SERVED',
        menuItem: { name: 'Croissant' },
        discounts: [],
      },
    ]);
    const out = await resolveTopItems(managerCtx, range, 999, 'QUANTITY');
    // limit clamped to 100, but result still has both rows.
    expect(out).toHaveLength(2);
    expect(out[0]?.menuItemId).toBe('mi-1');
    expect(out[0]?.quantitySold).toBe(3);
    expect(out[0]?.revenueCents).toBe(1250); // 1350 - 100
  });

  it('VOIDED items are excluded from totals', async () => {
    mockTicketItemFindMany.mockResolvedValueOnce([
      {
        ticketId: 'tk-1',
        menuItemId: 'mi-1',
        nameSnapshot: 'Latte',
        quantity: 1,
        lineSubtotalCents: 450,
        status: 'VOIDED',
        menuItem: { name: 'Latte' },
        discounts: [],
      },
    ]);
    const out = await resolveTopItems(managerCtx, range, 10, 'QUANTITY');
    expect(out).toHaveLength(0);
  });
});

describe('resolveHourlyMix', () => {
  it('returns 24 buckets', async () => {
    mockTicketFindMany.mockResolvedValueOnce([]);
    const out = await resolveHourlyMix(managerCtx, range);
    expect(out).toHaveLength(24);
    expect(out[0]?.hour).toBe(0);
    expect(out[23]?.hour).toBe(23);
  });
});

describe('resolveDayOfWeekMix', () => {
  it('returns 7 buckets MON..SUN', async () => {
    mockTicketFindMany.mockResolvedValueOnce([]);
    const out = await resolveDayOfWeekMix(managerCtx, range);
    expect(out.map((b) => b.dayOfWeek)).toEqual([
      'MON',
      'TUE',
      'WED',
      'THU',
      'FRI',
      'SAT',
      'SUN',
    ]);
  });
});

describe('resolveServerPerformance', () => {
  it('falls back to email when name is null', async () => {
    mockTicketFindMany.mockResolvedValueOnce([
      {
        openedById: 'u-1',
        totalCents: 1000,
        status: 'CLOSED',
        openedBy: { name: null, email: 'u@t' },
        items: [{ status: 'SERVED', servedById: 'u-1' }],
      },
    ]);
    const out = await resolveServerPerformance(managerCtx, range);
    expect(out[0]?.openedByName).toBe('u@t');
    expect(out[0]?.ticketCount).toBe(1);
  });
});

describe('resolveGuestCohort', () => {
  it('classifies guests with no prior visit as NEW', async () => {
    mockTicketFindMany.mockResolvedValueOnce([
      {
        guestId: 'g-1',
        closedAt: new Date('2026-04-26T19:00:00-07:00'),
      },
    ]);
    const out = await resolveGuestCohort(managerCtx, range);
    expect(out.newGuestCount).toBe(1);
    expect(out.returningGuestCount).toBe(0);
  });
});
