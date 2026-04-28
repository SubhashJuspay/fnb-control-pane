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
import { resolveReopenTicket } from './reopen-ticket.js';

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

const managerCtx = (): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'MANAGER',
  });

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

describe('resolveReopenTicket', () => {
  it('rejects STAFF (manager scope)', async () => {
    await expect(
      resolveReopenTicket({}, { ticketId: 'tk' }, staffCtx()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when ticket is OPEN (already)', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    await expect(
      resolveReopenTicket({}, { ticketId: 'tk' }, managerCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when ticket is VOIDED', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'VOIDED' });
    await expect(
      resolveReopenTicket({}, { ticketId: 'tk' }, managerCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path clears closedAt/closedById/closeNote', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'CLOSED' });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk' });
    await resolveReopenTicket({}, { ticketId: 'tk' }, managerCtx());
    expect(mockTicketUpdate.mock.calls[0]?.[0].data).toEqual({
      status: 'OPEN',
      closedAt: null,
      closedById: null,
      closeNote: null,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.reopened');
  });
});
