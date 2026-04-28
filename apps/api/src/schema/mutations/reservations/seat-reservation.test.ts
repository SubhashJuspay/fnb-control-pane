import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReservationFindFirst,
  mockReservationUpdate,
  mockTableFindFirst,
  mockTicketFindFirst,
  mockTicketCreate,
  mockTicketAggregate,
  mockLocationFindUnique,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockReservationFindFirst: vi.fn(),
  mockReservationUpdate: vi.fn(),
  mockTableFindFirst: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCreate: vi.fn(),
  mockTicketAggregate: vi.fn(),
  mockLocationFindUnique: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    reservation: {
      findFirst: mockReservationFindFirst,
      update: mockReservationUpdate,
    },
    table: { findFirst: mockTableFindFirst },
    ticket: {
      findFirst: mockTicketFindFirst,
      create: mockTicketCreate,
      aggregate: mockTicketAggregate,
    },
    location: { findUnique: mockLocationFindUnique },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveSeatReservation } from './seat-reservation.js';

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
      reservation: {
        findFirst: mockReservationFindFirst,
        update: mockReservationUpdate,
      },
      table: { findFirst: mockTableFindFirst },
      ticket: {
        findFirst: mockTicketFindFirst,
        create: mockTicketCreate,
        aggregate: mockTicketAggregate,
      },
      location: { findUnique: mockLocationFindUnique },
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
  location: { id: 'loc-9', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockReservationFindFirst.mockReset();
  mockReservationUpdate.mockReset();
  mockTableFindFirst.mockReset();
  mockTicketFindFirst.mockReset();
  mockTicketCreate.mockReset();
  mockTicketAggregate.mockReset();
  mockLocationFindUnique.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveSeatReservation', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveSeatReservation({ reservationId: 'r-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound when reservation not in viewer location', async () => {
    mockReservationFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveSeatReservation({ reservationId: 'r-1' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('Conflict when status is COMPLETED', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'COMPLETED',
      tableId: 't-1',
      guestName: 'X',
    });
    await expect(
      resolveSeatReservation({ reservationId: 'r-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('Conflict when no tableId provided and reservation has none', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'WAITING',
      tableId: null,
      guestName: 'X',
    });
    await expect(
      resolveSeatReservation({ reservationId: 'r-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: opens ticket, links reservation, sets SEATED', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'CONFIRMED',
      tableId: 't-1',
      guestName: 'John',
    });
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockTicketFindFirst.mockResolvedValueOnce(null);
    mockLocationFindUnique.mockResolvedValueOnce({
      businessDayCutoff: '04:00',
      timezone: 'America/Los_Angeles',
    });
    mockTicketAggregate.mockResolvedValueOnce({ _max: { shortNumber: 0 } });
    mockTicketCreate.mockResolvedValueOnce({
      id: 'tk-1',
      shortNumber: 1,
      businessDay: new Date('2026-04-28T00:00:00Z'),
    });
    mockReservationUpdate.mockResolvedValueOnce({ id: 'r-1' });
    const result = await resolveSeatReservation(
      { reservationId: 'r-1' },
      staffCtx,
    );
    expect(result).toEqual({ reservationId: 'r-1', ticketId: 'tk-1' });
    const updateData = mockReservationUpdate.mock.calls[0]?.[0].data;
    expect(updateData.status).toBe('SEATED');
    expect(updateData.tableId).toBe('t-1');
    expect(updateData.ticketId).toBe('tk-1');
    expect(updateData.seatedAt).toBeInstanceOf(Date);

    const auditActions = mockAuditCreate.mock.calls.map(
      (c) => c[0].data.action,
    );
    expect(auditActions).toContain('reservation.seated');
    expect(auditActions).toContain('ticket.opened_at_table');

    const channels = mockPublish.mock.calls.map((c) => c[0]);
    expect(channels).toContain('ticket_updates_loc-9');
    expect(channels).toContain('floor_updates_loc-9');
  });
});
