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
import { resolveUpdateTicketLabel } from './update-ticket-label.js';

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

beforeEach(() => {
  mockTicketFindFirst.mockReset();
  mockTicketUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveUpdateTicketLabel', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveUpdateTicketLabel(
        {},
        { ticketId: 'tk', customerLabel: 'L' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when ticket is not OPEN', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-1', status: 'CLOSED' });
    await expect(
      resolveUpdateTicketLabel(
        {},
        { ticketId: 'tk-1', customerLabel: 'X' },
        staffCtx('loc-9'),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path updates label and publishes event', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-1', status: 'OPEN' });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk-1' });
    await resolveUpdateTicketLabel(
      {},
      { ticketId: 'tk-1', customerLabel: 'Sarah' },
      staffCtx('loc-9'),
    );
    expect(mockTicketUpdate.mock.calls[0]?.[0].data).toEqual({ customerLabel: 'Sarah' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.label_updated');
    expect(mockPublish).toHaveBeenCalled();
  });
});
