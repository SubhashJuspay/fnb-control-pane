import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketFindFirst,
  mockTicketUpdate,
  mockTicketItemUpdateMany,
  mockTransaction,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketFindFirst: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockTicketItemUpdateMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
    ticketItem: { updateMany: mockTicketItemUpdateMany },
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
import { resolveVoidTicket } from './void-ticket.js';

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
      ticketItem: { updateMany: mockTicketItemUpdateMany },
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
  mockTicketFindFirst.mockReset();
  mockTicketUpdate.mockReset();
  mockTicketItemUpdateMany.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  mockTransaction.mockReset();
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      ticketItem: { updateMany: mockTicketItemUpdateMany },
      ticket: { update: mockTicketUpdate },
    }),
  );
});

describe('resolveVoidTicket', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveVoidTicket(
        {},
        { ticketId: 'tk', voidReason: 'oops' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when ticket is CLOSED', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'CLOSED' });
    await expect(
      resolveVoidTicket({}, { ticketId: 'tk', voidReason: 'oops' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path: cascades non-served items to VOIDED, zeroes totals', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk' });
    await resolveVoidTicket(
      {},
      { ticketId: 'tk', voidReason: 'spilled' },
      staffCtx(),
    );
    const itemUpdate = mockTicketItemUpdateMany.mock.calls[0]?.[0];
    expect(itemUpdate.where).toEqual({
      ticketId: 'tk',
      status: { in: ['NEW', 'FIRED', 'READY'] },
    });
    expect(itemUpdate.data.status).toBe('VOIDED');
    expect(itemUpdate.data.voidReason).toBe('spilled');
    const ticketUpdate = mockTicketUpdate.mock.calls[0]?.[0].data;
    expect(ticketUpdate.status).toBe('VOIDED');
    expect(ticketUpdate.subtotalCents).toBe(0);
    expect(ticketUpdate.totalCents).toBe(0);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.voided');
    expect(mockPublish).toHaveBeenCalled();
  });
});
