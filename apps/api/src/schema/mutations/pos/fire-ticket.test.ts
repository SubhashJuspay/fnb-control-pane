import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketFindFirst,
  mockTicketFindUnique,
  mockTicketItemFindMany,
  mockTicketItemUpdateMany,
  mockTransaction,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketFindFirst: vi.fn(),
  mockTicketFindUnique: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockTicketItemUpdateMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { findFirst: mockTicketFindFirst, findUnique: mockTicketFindUnique },
    ticketItem: {
      findMany: mockTicketItemFindMany,
      updateMany: mockTicketItemUpdateMany,
    },
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
import { resolveFireTicket } from './fire-ticket.js';

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
      ticket: { findFirst: mockTicketFindFirst, findUnique: mockTicketFindUnique },
      ticketItem: {
        findMany: mockTicketItemFindMany,
        updateMany: mockTicketItemUpdateMany,
      },
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
  mockTicketFindUnique.mockReset();
  mockTicketItemFindMany.mockReset();
  mockTicketItemUpdateMany.mockReset();
  mockTransaction.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ ticketItem: { updateMany: mockTicketItemUpdateMany } }),
  );
});

describe('resolveFireTicket', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveFireTicket({}, { ticketId: 'tk' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when ticket not OPEN', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'CLOSED' });
    await expect(
      resolveFireTicket({}, { ticketId: 'tk' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when nothing to fire', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockTicketItemFindMany.mockResolvedValueOnce([]);
    await expect(
      resolveFireTicket({}, { ticketId: 'tk' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path: writes one audit per item, publishes per item + ticket', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockTicketItemFindMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    mockTicketFindUnique.mockResolvedValueOnce({ id: 'tk' });
    await resolveFireTicket({}, { ticketId: 'tk' }, staffCtx());
    expect(mockTicketItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['a', 'b'] } },
        data: expect.objectContaining({ status: 'FIRED' }),
      }),
    );
    expect(mockAuditCreate).toHaveBeenCalledTimes(2);
    const actions = mockAuditCreate.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(['ticket_item.fired', 'ticket_item.fired']);
    // 2 per-item TicketItemChanged + 1 TicketChanged
    expect(mockPublish).toHaveBeenCalledTimes(3);
  });
});
