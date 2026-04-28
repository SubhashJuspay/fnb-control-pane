import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTicketFindFirst, mockTicketUpdate, mockAuditCreate, mockPublish } = vi.hoisted(
  () => ({
    mockTicketFindFirst: vi.fn(),
    mockTicketUpdate: vi.fn(),
    mockAuditCreate: vi.fn(),
    mockPublish: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { resolveUpdateTicketOrderType } from './update-ticket-order-type.js';

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
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveUpdateTicketOrderType', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveUpdateTicketOrderType(
        {},
        { ticketId: 'tk', orderType: 'TAKEOUT' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when ticket is VOIDED', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-1', status: 'VOIDED' });
    await expect(
      resolveUpdateTicketOrderType(
        {},
        { ticketId: 'tk-1', orderType: 'TAKEOUT' },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path updates orderType', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-1', status: 'OPEN' });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk-1' });
    await resolveUpdateTicketOrderType(
      {},
      { ticketId: 'tk-1', orderType: 'TAKEOUT' },
      staffCtx(),
    );
    expect(mockTicketUpdate.mock.calls[0]?.[0].data).toEqual({ orderType: 'TAKEOUT' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'ticket.order_type_updated',
    );
  });
});
