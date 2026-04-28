import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReservationFindFirst,
  mockReservationUpdate,
  mockGuestFindFirst,
  mockGuestUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockReservationFindFirst: vi.fn(),
  mockReservationUpdate: vi.fn(),
  mockGuestFindFirst: vi.fn(),
  mockGuestUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    reservation: { findFirst: mockReservationFindFirst, update: mockReservationUpdate },
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
import { resolveLinkReservationGuest } from './link-reservation-guest.js';

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
      reservation: { findFirst: mockReservationFindFirst, update: mockReservationUpdate },
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
  mockReservationFindFirst.mockReset();
  mockReservationUpdate.mockReset();
  mockGuestFindFirst.mockReset();
  mockGuestUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveLinkReservationGuest', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveLinkReservationGuest(
        {},
        { reservationId: 'r-1', guestId: 'g-1' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('NotFound when reservation is at another location', async () => {
    mockReservationFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveLinkReservationGuest(
        {},
        { reservationId: 'r-1', guestId: 'g-1' },
        staffCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('NotFound when guest is in another tenant', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      guestId: null,
      requestedTime: new Date(),
      createdAt: new Date(),
    });
    mockGuestFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveLinkReservationGuest(
        {},
        { reservationId: 'r-1', guestId: 'g-1' },
        staffCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('links and writes audit reservation.guest_linked', async () => {
    const created = new Date('2026-04-26T19:00:00Z');
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      guestId: null,
      requestedTime: new Date('2026-05-01T19:00:00Z'),
      createdAt: created,
    });
    mockGuestFindFirst.mockResolvedValueOnce({ id: 'g-1', lastSeenAt: null });
    mockReservationUpdate.mockResolvedValueOnce({ id: 'r-1' });
    mockGuestUpdate.mockResolvedValueOnce({ id: 'g-1' });
    await resolveLinkReservationGuest(
      {},
      { reservationId: 'r-1', guestId: 'g-1' },
      staffCtx,
    );
    expect(mockReservationUpdate.mock.calls[0]?.[0].data.guestId).toBe('g-1');
    expect(mockGuestUpdate.mock.calls[0]?.[0].data.lastSeenAt).toEqual(created);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('reservation.guest_linked');
    expect(mockPublish.mock.calls[0]?.[1].kind).toBe('ReservationChanged');
  });

  it('null guestId unlinks', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      guestId: 'g-prev',
      requestedTime: new Date(),
      createdAt: new Date(),
    });
    mockReservationUpdate.mockResolvedValueOnce({ id: 'r-1' });
    await resolveLinkReservationGuest(
      {},
      { reservationId: 'r-1', guestId: null },
      staffCtx,
    );
    expect(mockReservationUpdate.mock.calls[0]?.[0].data.guestId).toBe(null);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('reservation.guest_unlinked');
  });
});
