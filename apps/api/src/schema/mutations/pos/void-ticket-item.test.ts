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
import { resolveVoidTicketItem } from './void-ticket-item.js';

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

describe('resolveVoidTicketItem', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveVoidTicketItem(
        {},
        { ticketItemId: 'ti', voidReason: 'oops' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects voiding a SERVED item', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'SERVED',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    await expect(
      resolveVoidTicketItem(
        {},
        { ticketItemId: 'ti', voidReason: 'oops' },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when ticket is CLOSED', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'NEW',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'CLOSED' },
    });
    await expect(
      resolveVoidTicketItem(
        {},
        { ticketItemId: 'ti', voidReason: 'oops' },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path: NEW → VOIDED, audit, publish', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'FIRED',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    mockTicketItemUpdate.mockResolvedValueOnce({ id: 'ti' });
    await resolveVoidTicketItem(
      {},
      { ticketItemId: 'ti', voidReason: 'spilled' },
      staffCtx(),
    );
    const data = mockTicketItemUpdate.mock.calls[0]?.[0].data;
    expect(data.status).toBe('VOIDED');
    expect(data.voidReason).toBe('spilled');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket_item.voided');
  });
});
