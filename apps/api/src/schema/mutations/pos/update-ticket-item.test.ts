import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketItemFindUnique,
  mockTicketItemUpdate,
  mockTicketItemFindMany,
  mockDiscountFindMany,
  mockTicketUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketItemFindUnique: vi.fn(),
  mockTicketItemUpdate: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockDiscountFindMany: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticketItem: {
      findUnique: mockTicketItemFindUnique,
      update: mockTicketItemUpdate,
      findMany: mockTicketItemFindMany,
    },
    discount: { findMany: mockDiscountFindMany },
    ticket: { update: mockTicketUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { resolveUpdateTicketItem } from './update-ticket-item.js';

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
      discount: { findMany: mockDiscountFindMany },
      ticket: { update: mockTicketUpdate },
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
  mockTicketItemFindUnique.mockReset();
  mockTicketItemUpdate.mockReset();
  mockTicketItemFindMany.mockReset();
  mockDiscountFindMany.mockReset();
  mockTicketUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  mockTicketItemFindMany.mockResolvedValue([]);
  mockDiscountFindMany.mockResolvedValue([]);
});

describe('resolveUpdateTicketItem', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveUpdateTicketItem(
        {},
        { ticketItemId: 'ti' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when item not at viewer location', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'NEW',
      ticketId: 'tk',
      unitPriceCents: 100,
      modifiers: [],
      ticket: { locationId: 'other', status: 'OPEN' },
    });
    await expect(
      resolveUpdateTicketItem({}, { ticketItemId: 'ti' }, staffCtx()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when item is not NEW', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'FIRED',
      ticketId: 'tk',
      unitPriceCents: 100,
      modifiers: [],
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    await expect(
      resolveUpdateTicketItem({}, { ticketItemId: 'ti', quantity: 3 }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path recomputes lineSubtotal on quantity change', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'NEW',
      ticketId: 'tk',
      unitPriceCents: 525,
      quantity: 1,
      modifiers: [{ priceDeltaCents: 50 }],
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    mockTicketItemUpdate.mockResolvedValueOnce({ id: 'ti' });
    await resolveUpdateTicketItem(
      {},
      { ticketItemId: 'ti', quantity: 3, notes: 'extra hot' },
      staffCtx(),
    );
    const data = mockTicketItemUpdate.mock.calls[0]?.[0].data;
    expect(data.quantity).toBe(3);
    expect(data.notes).toBe('extra hot');
    // (525 + 50) * 3 = 1725
    expect(data.lineSubtotalCents).toBe(1725);
    expect(data.modifiersTotalCents).toBe(50);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket_item.updated');
  });
});
