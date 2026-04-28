import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTicketFindMany, mockTicketFindFirst, mockTicketCount } = vi.hoisted(() => ({
  mockTicketFindMany: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCount: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    ticket: {
      findMany: mockTicketFindMany,
      findFirst: mockTicketFindFirst,
      count: mockTicketCount,
    },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import {
  buildTicketHistoryWhere,
  resolveEffectivePriceAfterDiscounts,
  resolveItemSummary,
  resolveKitchenTickets,
  resolveOpenTickets,
  resolveTicketByShortNumber,
  resolveTicketHistory,
  resolveTicketById,
  sortKitchenTickets,
  type TicketRow,
} from './ticket.js';

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
      ticket: {
        findMany: mockTicketFindMany,
        findFirst: mockTicketFindFirst,
        count: mockTicketCount,
      },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (locationId: string | null = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'STAFF',
  });

const managerCtx = (locationId: string | null = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'MANAGER',
  });

const viewerCtx = (locationId: string | null = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'VIEWER',
  });

beforeEach(() => {
  mockTicketFindMany.mockReset();
  mockTicketFindFirst.mockReset();
  mockTicketCount.mockReset();
});

describe('resolveItemSummary', () => {
  it('returns "0 items" for an empty ticket', () => {
    expect(resolveItemSummary([])).toBe('0 items');
  });

  it('ignores VOIDED items', () => {
    const out = resolveItemSummary([
      { status: 'NEW', quantity: 1, nameSnapshot: 'Latte' },
      { status: 'VOIDED', quantity: 1, nameSnapshot: 'Croissant' },
    ]);
    expect(out).toBe('1 items: 1 Latte');
  });

  it('sums quantities and lists each line', () => {
    const out = resolveItemSummary([
      { status: 'NEW', quantity: 1, nameSnapshot: 'Latte' },
      { status: 'FIRED', quantity: 2, nameSnapshot: 'Croissant' },
    ]);
    expect(out).toBe('3 items: 1 Latte, 2 Croissant');
  });
});

describe('resolveEffectivePriceAfterDiscounts', () => {
  it('returns lineSubtotalCents when no discounts', () => {
    expect(
      resolveEffectivePriceAfterDiscounts({ lineSubtotalCents: 525, discounts: [] }),
    ).toBe(525);
  });

  it('subtracts only non-voided discount computedCents', () => {
    expect(
      resolveEffectivePriceAfterDiscounts({
        lineSubtotalCents: 1000,
        discounts: [
          { computedCents: 100, voidedAt: null },
          { computedCents: 200, voidedAt: new Date() },
          { computedCents: 50, voidedAt: null },
        ],
      }),
    ).toBe(850);
  });

  it('clamps to zero when discounts exceed subtotal', () => {
    expect(
      resolveEffectivePriceAfterDiscounts({
        lineSubtotalCents: 100,
        discounts: [{ computedCents: 999, voidedAt: null }],
      }),
    ).toBe(0);
  });
});

describe('sortKitchenTickets', () => {
  const ticket = (id: string, items: Array<{ status: string; firedAt: Date | null }>): TicketRow & {
    items: Array<{ status: string; firedAt: Date | null }>;
  } => ({
    id,
    locationId: 'loc-1',
    shortNumber: 1,
    businessDay: new Date(),
    customerLabel: null,
    orderType: 'DINE_IN',
    status: 'OPEN',
    openedById: 'u-1',
    openedAt: new Date(),
    closedById: null,
    closedAt: null,
    voidedById: null,
    voidedAt: null,
    voidReason: null,
    closeNote: null,
    subtotalCents: 0,
    discountCents: 0,
    taxCents: 0,
    totalCents: 0,
    items,
  });

  it('orders tickets by oldest FIRED firedAt first', () => {
    const t1 = new Date('2024-01-01T12:00:00Z');
    const t2 = new Date('2024-01-01T12:05:00Z');
    const sorted = sortKitchenTickets([
      ticket('a', [{ status: 'FIRED', firedAt: t2 }]),
      ticket('b', [{ status: 'FIRED', firedAt: t1 }]),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('pushes ticket with only READY items to the end', () => {
    const t1 = new Date('2024-01-01T12:00:00Z');
    const sorted = sortKitchenTickets([
      ticket('a', [{ status: 'READY', firedAt: null }]),
      ticket('b', [{ status: 'FIRED', firedAt: t1 }]),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('buildTicketHistoryWhere', () => {
  it('always scopes by locationId', () => {
    expect(buildTicketHistoryWhere('loc-x', null)).toEqual({ locationId: 'loc-x' });
  });

  it('layers on status, serverId and date range', () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-02-01');
    expect(
      buildTicketHistoryWhere('loc-x', {
        status: 'CLOSED',
        serverId: 'u-9',
        fromDate: from,
        toDate: to,
      }),
    ).toEqual({
      locationId: 'loc-x',
      status: 'CLOSED',
      openedById: 'u-9',
      openedAt: { gte: from, lte: to },
    });
  });
});

describe('resolveOpenTickets', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveOpenTickets({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when no location', async () => {
    await expect(resolveOpenTickets({}, staffCtx(null))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('queries OPEN tickets at the viewer location ordered by openedAt asc', async () => {
    mockTicketFindMany.mockResolvedValueOnce([{ id: 't-1' }]);
    await resolveOpenTickets({}, staffCtx('loc-9'));
    expect(mockTicketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { locationId: 'loc-9', status: 'OPEN' },
        orderBy: { openedAt: 'asc' },
      }),
    );
  });
});

describe('resolveTicketById', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveTicketById({}, ctxFor({ kind: 'anonymous' }), 'tk-1'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns ticket scoped to viewer location', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-1' });
    await resolveTicketById({}, staffCtx('loc-9'), 'tk-1');
    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tk-1', locationId: 'loc-9' },
      }),
    );
  });
});

describe('resolveKitchenTickets', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveKitchenTickets({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('queries tickets with FIRED-or-READY items, then sorts client-side', async () => {
    const t1 = new Date('2024-01-01T12:00:00Z');
    const t2 = new Date('2024-01-01T12:05:00Z');
    // First findMany — sort key fetch (id + items.status/firedAt only).
    mockTicketFindMany.mockResolvedValueOnce([
      { id: 'a', items: [{ status: 'FIRED', firedAt: t2 }] },
      { id: 'b', items: [{ status: 'FIRED', firedAt: t1 }] },
    ]);
    // Second findMany — Pothos-driven row fetch with the GraphQL selection.
    mockTicketFindMany.mockResolvedValueOnce([
      { id: 'a' },
      { id: 'b' },
    ]);
    const out = (await resolveKitchenTickets({}, staffCtx('loc-9'))) as Array<{
      id: string;
    }>;
    expect(out.map((t) => t.id)).toEqual(['b', 'a']);
    // Both calls must be location-scoped to FIRED/READY items.
    expect(mockTicketFindMany).toHaveBeenCalledTimes(2);
    expect(mockTicketFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          locationId: 'loc-9',
          items: { some: { status: { in: ['FIRED', 'READY'] } } },
        }),
      }),
    );
    expect(mockTicketFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          locationId: 'loc-9',
          items: { some: { status: { in: ['FIRED', 'READY'] } } },
        }),
      }),
    );
  });
});

describe('resolveTicketHistory', () => {
  it('rejects staff role (manager scope)', async () => {
    await expect(
      resolveTicketHistory({}, staffCtx('loc-9'), null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects viewer role', async () => {
    await expect(
      resolveTicketHistory({}, viewerCtx('loc-9'), null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('manager: location-scoped query ordered desc by openedAt', async () => {
    mockTicketFindMany.mockResolvedValueOnce([]);
    await resolveTicketHistory({}, managerCtx('loc-9'), { status: 'CLOSED' });
    expect(mockTicketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { locationId: 'loc-9', status: 'CLOSED' },
        orderBy: { openedAt: 'desc' },
      }),
    );
  });
});

describe('resolveTicketByShortNumber', () => {
  it('rejects when no location', async () => {
    await expect(
      resolveTicketByShortNumber({}, staffCtx(null), 1, new Date()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('looks up by (locationId, businessDay, shortNumber)', async () => {
    const day = new Date('2024-01-15T00:00:00Z');
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-1' });
    await resolveTicketByShortNumber({}, staffCtx('loc-9'), 42, day);
    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { locationId: 'loc-9', businessDay: day, shortNumber: 42 },
      }),
    );
  });
});
