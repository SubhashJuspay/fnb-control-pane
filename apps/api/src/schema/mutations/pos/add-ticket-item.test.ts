import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketFindFirst,
  mockTicketUpdate,
  mockMenuItemFindFirst,
  mockLocationItemFindUnique,
  mockModifierFindMany,
  mockLocationModifierFindMany,
  mockMenuItemModifierGroupFindMany,
  mockTicketItemCreate,
  mockTicketItemFindMany,
  mockDiscountFindMany,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketFindFirst: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockMenuItemFindFirst: vi.fn(),
  mockLocationItemFindUnique: vi.fn(),
  mockModifierFindMany: vi.fn(),
  mockLocationModifierFindMany: vi.fn(),
  mockMenuItemModifierGroupFindMany: vi.fn(),
  mockTicketItemCreate: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockDiscountFindMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
    menuItem: { findFirst: mockMenuItemFindFirst },
    locationItem: { findUnique: mockLocationItemFindUnique },
    modifier: { findMany: mockModifierFindMany },
    locationModifier: { findMany: mockLocationModifierFindMany },
    menuItemModifierGroup: { findMany: mockMenuItemModifierGroupFindMany },
    ticketItem: { create: mockTicketItemCreate, findMany: mockTicketItemFindMany },
    discount: { findMany: mockDiscountFindMany },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveAddTicketItem } from './add-ticket-item.js';

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
      ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
      menuItem: { findFirst: mockMenuItemFindFirst },
      locationItem: { findUnique: mockLocationItemFindUnique },
      modifier: { findMany: mockModifierFindMany },
      locationModifier: { findMany: mockLocationModifierFindMany },
      menuItemModifierGroup: { findMany: mockMenuItemModifierGroupFindMany },
      ticketItem: { create: mockTicketItemCreate, findMany: mockTicketItemFindMany },
      discount: { findMany: mockDiscountFindMany },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'STAFF',
  });

beforeEach(() => {
  mockTicketFindFirst.mockReset();
  mockTicketUpdate.mockReset();
  mockMenuItemFindFirst.mockReset();
  mockLocationItemFindUnique.mockReset();
  mockModifierFindMany.mockReset();
  mockLocationModifierFindMany.mockReset();
  mockMenuItemModifierGroupFindMany.mockReset();
  mockTicketItemCreate.mockReset();
  mockTicketItemFindMany.mockReset();
  mockDiscountFindMany.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  // Default: no live items / no discounts to keep recomputeTotals happy.
  mockTicketItemFindMany.mockResolvedValue([]);
  mockDiscountFindMany.mockResolvedValue([]);
});

describe('resolveAddTicketItem', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveAddTicketItem(
        {},
        { ticketId: 'tk', menuItemId: 'mi' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when ticket is not OPEN', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'CLOSED' });
    await expect(
      resolveAddTicketItem({}, { ticketId: 'tk', menuItemId: 'mi' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when menu item not found / archived', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveAddTicketItem({}, { ticketId: 'tk', menuItemId: 'mi' }, staffCtx()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path snapshots price + base name + course', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockMenuItemFindFirst.mockResolvedValueOnce({
      id: 'mi',
      name: 'Latte',
      basePriceCents: 525,
      course: 'BEVERAGE',
    });
    mockLocationItemFindUnique.mockResolvedValueOnce(null);
    mockMenuItemModifierGroupFindMany.mockResolvedValueOnce([]);
    mockTicketItemCreate.mockResolvedValueOnce({ id: 'ti-1' });
    await resolveAddTicketItem(
      {},
      { ticketId: 'tk', menuItemId: 'mi', quantity: 2 },
      staffCtx(),
    );
    const data = mockTicketItemCreate.mock.calls[0]?.[0].data;
    expect(data.nameSnapshot).toBe('Latte');
    expect(data.unitPriceCents).toBe(525);
    expect(data.quantity).toBe(2);
    expect(data.lineSubtotalCents).toBe(1050);
    expect(data.course).toBe('BEVERAGE');
    expect(data.status).toBe('NEW');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket_item.added');
    expect(mockPublish).toHaveBeenCalledTimes(2);
  });

  it('uses location override price if set', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockMenuItemFindFirst.mockResolvedValueOnce({
      id: 'mi',
      name: 'Latte',
      basePriceCents: 525,
      course: 'BEVERAGE',
    });
    mockLocationItemFindUnique.mockResolvedValueOnce({ priceCents: 600 });
    mockMenuItemModifierGroupFindMany.mockResolvedValueOnce([]);
    mockTicketItemCreate.mockResolvedValueOnce({ id: 'ti-1' });
    await resolveAddTicketItem(
      {},
      { ticketId: 'tk', menuItemId: 'mi', quantity: 1 },
      staffCtx(),
    );
    expect(mockTicketItemCreate.mock.calls[0]?.[0].data.unitPriceCents).toBe(600);
  });

  it('rejects when modifier-group min is violated (required-1 with 0)', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockMenuItemFindFirst.mockResolvedValueOnce({
      id: 'mi',
      name: 'Latte',
      basePriceCents: 525,
      course: 'BEVERAGE',
    });
    mockLocationItemFindUnique.mockResolvedValueOnce(null);
    mockMenuItemModifierGroupFindMany.mockResolvedValueOnce([
      {
        modifierGroup: { id: 'g1', name: 'Size', minSelections: 1, maxSelections: 1 },
      },
    ]);
    await expect(
      resolveAddTicketItem(
        {},
        { ticketId: 'tk', menuItemId: 'mi', modifiers: [] },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when modifier-group max is violated (max-3 with 4)', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockMenuItemFindFirst.mockResolvedValueOnce({
      id: 'mi',
      name: 'Pizza',
      basePriceCents: 1500,
      course: 'MAIN',
    });
    mockLocationItemFindUnique.mockResolvedValueOnce(null);
    mockModifierFindMany.mockResolvedValueOnce(
      ['m1', 'm2', 'm3', 'm4'].map((id) => ({
        id,
        name: id,
        priceDeltaCents: 0,
        modifierGroupId: 'g1',
        modifierGroup: { id: 'g1', name: 'Toppings' },
      })),
    );
    mockLocationModifierFindMany.mockResolvedValueOnce([]);
    mockMenuItemModifierGroupFindMany.mockResolvedValueOnce([
      {
        modifierGroup: { id: 'g1', name: 'Toppings', minSelections: 0, maxSelections: 3 },
      },
    ]);
    await expect(
      resolveAddTicketItem(
        {},
        {
          ticketId: 'tk',
          menuItemId: 'mi',
          modifiers: [
            { modifierId: 'm1' },
            { modifierId: 'm2' },
            { modifierId: 'm3' },
            { modifierId: 'm4' },
          ],
        },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
