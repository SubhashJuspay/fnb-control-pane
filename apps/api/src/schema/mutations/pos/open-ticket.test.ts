import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketCreate,
  mockTicketAggregate,
  mockLocationFindUnique,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketCreate: vi.fn(),
  mockTicketAggregate: vi.fn(),
  mockLocationFindUnique: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { create: mockTicketCreate, aggregate: mockTicketAggregate },
    location: { findUnique: mockLocationFindUnique },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { resolveOpenTicket } from './open-ticket.js';

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
      ticket: { create: mockTicketCreate, aggregate: mockTicketAggregate },
      location: { findUnique: mockLocationFindUnique },
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
  mockTicketCreate.mockReset();
  mockTicketAggregate.mockReset();
  mockLocationFindUnique.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveOpenTicket', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveOpenTicket({}, {}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects VIEWER role', async () => {
    await expect(
      resolveOpenTicket(
        {},
        {},
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
          role: 'VIEWER',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when no location', async () => {
    await expect(resolveOpenTicket({}, {}, staffCtx(null))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('happy path: allocates shortNumber, writes audit, publishes', async () => {
    mockLocationFindUnique.mockResolvedValueOnce({
      businessDayCutoff: '04:00',
      timezone: 'America/Los_Angeles',
    });
    mockTicketAggregate.mockResolvedValueOnce({ _max: { shortNumber: 4 } });
    mockTicketCreate.mockResolvedValueOnce({ id: 'tk-1' });
    await resolveOpenTicket({}, { customerLabel: 'Sarah' }, staffCtx('loc-9'));
    const data = mockTicketCreate.mock.calls[0]?.[0].data;
    expect(data.shortNumber).toBe(5);
    expect(data.locationId).toBe('loc-9');
    expect(data.openedById).toBe('u-1');
    expect(data.status).toBe('OPEN');
    expect(data.subtotalCents).toBe(0);
    expect(data.orderType).toBe('DINE_IN');
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.opened');
    expect(mockPublish).toHaveBeenCalledWith('ticket_updates_loc-9', {
      kind: 'TicketChanged',
      ticketId: 'tk-1',
    });
  });

  it('first ticket of the day starts at shortNumber 1', async () => {
    mockLocationFindUnique.mockResolvedValueOnce({
      businessDayCutoff: '04:00',
      timezone: 'America/Los_Angeles',
    });
    mockTicketAggregate.mockResolvedValueOnce({ _max: { shortNumber: null } });
    mockTicketCreate.mockResolvedValueOnce({ id: 'tk-1' });
    await resolveOpenTicket({}, {}, staffCtx());
    expect(mockTicketCreate.mock.calls[0]?.[0].data.shortNumber).toBe(1);
  });

  it('retries on P2002 unique violation', async () => {
    mockLocationFindUnique.mockResolvedValueOnce({
      businessDayCutoff: '04:00',
      timezone: 'America/Los_Angeles',
    });
    mockTicketAggregate
      .mockResolvedValueOnce({ _max: { shortNumber: 1 } })
      .mockResolvedValueOnce({ _max: { shortNumber: 2 } });
    const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
    mockTicketCreate
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ id: 'tk-1' });
    const out = (await resolveOpenTicket({}, {}, staffCtx('loc-9'))) as { id: string };
    expect(out.id).toBe('tk-1');
    expect(mockTicketCreate).toHaveBeenCalledTimes(2);
  });
});
