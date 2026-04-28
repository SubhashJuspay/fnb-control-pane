import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketFindFirst,
  mockTicketUpdate,
  mockGuestFindFirst,
  mockGuestUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketFindFirst: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockGuestFindFirst: vi.fn(),
  mockGuestUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
    guest: { findFirst: mockGuestFindFirst, update: mockGuestUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveLinkTicketGuest } from './link-ticket-guest.js';

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
      guest: { findFirst: mockGuestFindFirst, update: mockGuestUpdate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockTicketFindFirst.mockReset();
  mockTicketUpdate.mockReset();
  mockGuestFindFirst.mockReset();
  mockGuestUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveLinkTicketGuest', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveLinkTicketGuest(
        {},
        { ticketId: 't-1', guestId: 'g-1' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('NotFound when ticket is at another location', async () => {
    mockTicketFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveLinkTicketGuest({}, { ticketId: 't-1', guestId: 'g-1' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('NotFound when guest is in another tenant', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({
      id: 't-1',
      openedAt: new Date('2026-04-26T19:00:00Z'),
      guestId: null,
    });
    mockGuestFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveLinkTicketGuest({}, { ticketId: 't-1', guestId: 'g-1' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path: links and refreshes lastSeenAt when openedAt > lastSeenAt', async () => {
    const opened = new Date('2026-04-26T19:00:00Z');
    mockTicketFindFirst.mockResolvedValueOnce({ id: 't-1', openedAt: opened, guestId: null });
    mockGuestFindFirst.mockResolvedValueOnce({
      id: 'g-1',
      lastSeenAt: new Date('2026-04-20T00:00:00Z'),
    });
    mockTicketUpdate.mockResolvedValueOnce({ id: 't-1' });
    mockGuestUpdate.mockResolvedValueOnce({ id: 'g-1' });
    await resolveLinkTicketGuest(
      {},
      { ticketId: 't-1', guestId: 'g-1' },
      staffCtx,
    );
    expect(mockTicketUpdate.mock.calls[0]?.[0].data.guestId).toBe('g-1');
    expect(mockGuestUpdate.mock.calls[0]?.[0].data.lastSeenAt).toEqual(opened);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.guest_linked');
    expect(mockPublish.mock.calls[0]?.[1].kind).toBe('TicketChanged');
  });

  it('does not regress lastSeenAt when current is newer', async () => {
    const opened = new Date('2026-04-20T00:00:00Z');
    mockTicketFindFirst.mockResolvedValueOnce({ id: 't-1', openedAt: opened, guestId: null });
    mockGuestFindFirst.mockResolvedValueOnce({
      id: 'g-1',
      lastSeenAt: new Date('2026-04-26T19:00:00Z'),
    });
    mockTicketUpdate.mockResolvedValueOnce({ id: 't-1' });
    await resolveLinkTicketGuest(
      {},
      { ticketId: 't-1', guestId: 'g-1' },
      staffCtx,
    );
    expect(mockGuestUpdate).not.toHaveBeenCalled();
  });

  it('null guestId unlinks and audits as ticket.guest_unlinked', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({
      id: 't-1',
      openedAt: new Date(),
      guestId: 'g-prev',
    });
    mockTicketUpdate.mockResolvedValueOnce({ id: 't-1' });
    await resolveLinkTicketGuest({}, { ticketId: 't-1', guestId: null }, staffCtx);
    expect(mockTicketUpdate.mock.calls[0]?.[0].data.guestId).toBe(null);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.guest_unlinked');
  });
});
