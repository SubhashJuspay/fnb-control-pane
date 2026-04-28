import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketItemFindUnique,
  mockTicketItemUpdate,
  mockTicketItemFindMany,
  mockTicketItemModifierDeleteMany,
  mockTicketItemModifierCreateMany,
  mockModifierFindMany,
  mockLocationModifierFindMany,
  mockMenuItemModifierGroupFindMany,
  mockDiscountFindMany,
  mockTicketUpdate,
  mockAuditCreate,
  mockPublish,
  mockTransaction,
} = vi.hoisted(() => ({
  mockTicketItemFindUnique: vi.fn(),
  mockTicketItemUpdate: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockTicketItemModifierDeleteMany: vi.fn(),
  mockTicketItemModifierCreateMany: vi.fn(),
  mockModifierFindMany: vi.fn(),
  mockLocationModifierFindMany: vi.fn(),
  mockMenuItemModifierGroupFindMany: vi.fn(),
  mockDiscountFindMany: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
  mockTransaction: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticketItem: {
      findUnique: mockTicketItemFindUnique,
      update: mockTicketItemUpdate,
      findMany: mockTicketItemFindMany,
    },
    ticketItemModifier: {
      deleteMany: mockTicketItemModifierDeleteMany,
      createMany: mockTicketItemModifierCreateMany,
    },
    modifier: { findMany: mockModifierFindMany },
    locationModifier: { findMany: mockLocationModifierFindMany },
    menuItemModifierGroup: { findMany: mockMenuItemModifierGroupFindMany },
    discount: { findMany: mockDiscountFindMany },
    ticket: { update: mockTicketUpdate },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { resolveSetTicketItemModifiers } from './set-ticket-item-modifiers.js';

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
      ticketItem: {
        findUnique: mockTicketItemFindUnique,
        update: mockTicketItemUpdate,
        findMany: mockTicketItemFindMany,
      },
      ticketItemModifier: {
        deleteMany: mockTicketItemModifierDeleteMany,
        createMany: mockTicketItemModifierCreateMany,
      },
      modifier: { findMany: mockModifierFindMany },
      locationModifier: { findMany: mockLocationModifierFindMany },
      menuItemModifierGroup: { findMany: mockMenuItemModifierGroupFindMany },
      discount: { findMany: mockDiscountFindMany },
      ticket: { update: mockTicketUpdate },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
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
  mockTicketItemFindUnique.mockReset();
  mockTicketItemUpdate.mockReset();
  mockTicketItemFindMany.mockReset();
  mockTicketItemModifierDeleteMany.mockReset();
  mockTicketItemModifierCreateMany.mockReset();
  mockModifierFindMany.mockReset();
  mockLocationModifierFindMany.mockReset();
  mockMenuItemModifierGroupFindMany.mockReset();
  mockDiscountFindMany.mockReset();
  mockTicketUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  mockTransaction.mockReset();
  mockTicketItemFindMany.mockResolvedValue([]);
  mockDiscountFindMany.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      ticketItemModifier: {
        deleteMany: mockTicketItemModifierDeleteMany,
        createMany: mockTicketItemModifierCreateMany,
      },
      ticketItem: { update: mockTicketItemUpdate },
    }),
  );
});

describe('resolveSetTicketItemModifiers', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveSetTicketItemModifiers(
        {},
        { ticketItemId: 'ti', modifierIds: [] },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when item is FIRED (only NEW allowed)', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'FIRED',
      ticketId: 'tk',
      menuItemId: 'mi',
      unitPriceCents: 525,
      quantity: 1,
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    await expect(
      resolveSetTicketItemModifiers(
        {},
        { ticketItemId: 'ti', modifierIds: [] },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects on group min violation', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'NEW',
      ticketId: 'tk',
      menuItemId: 'mi',
      unitPriceCents: 525,
      quantity: 1,
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    mockMenuItemModifierGroupFindMany.mockResolvedValueOnce([
      {
        modifierGroup: { id: 'g1', name: 'Size', minSelections: 1, maxSelections: 1 },
      },
    ]);
    await expect(
      resolveSetTicketItemModifiers(
        {},
        { ticketItemId: 'ti', modifierIds: [] },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path replaces modifiers and recomputes lineSubtotal', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'NEW',
      ticketId: 'tk',
      menuItemId: 'mi',
      unitPriceCents: 525,
      quantity: 2,
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    mockModifierFindMany.mockResolvedValueOnce([
      {
        id: 'mod-1',
        name: 'Large',
        priceDeltaCents: 100,
        modifierGroupId: 'g1',
        modifierGroup: { id: 'g1', name: 'Size' },
      },
    ]);
    mockLocationModifierFindMany.mockResolvedValueOnce([]);
    mockMenuItemModifierGroupFindMany.mockResolvedValueOnce([
      {
        modifierGroup: { id: 'g1', name: 'Size', minSelections: 1, maxSelections: 1 },
      },
    ]);
    mockTicketItemUpdate.mockResolvedValueOnce({ id: 'ti' });
    await resolveSetTicketItemModifiers(
      {},
      { ticketItemId: 'ti', modifierIds: ['mod-1'] },
      staffCtx(),
    );
    expect(mockTicketItemModifierDeleteMany).toHaveBeenCalled();
    expect(mockTicketItemModifierCreateMany).toHaveBeenCalled();
    const data = mockTicketItemUpdate.mock.calls[0]?.[0].data;
    // (525 + 100) * 2 = 1250
    expect(data.lineSubtotalCents).toBe(1250);
    expect(data.modifiersTotalCents).toBe(100);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'ticket_item.modifiers_set',
    );
  });
});
