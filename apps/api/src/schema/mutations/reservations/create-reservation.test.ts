import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReservationCreate,
  mockTableFindFirst,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockReservationCreate: vi.fn(),
  mockTableFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    reservation: { create: mockReservationCreate },
    table: { findFirst: mockTableFindFirst },
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
import { resolveCreateReservation } from './create-reservation.js';

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
      reservation: { create: mockReservationCreate },
      table: { findFirst: mockTableFindFirst },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-9', timezone: 'UTC', currency: 'USD' },
  role: 'MANAGER',
});

beforeEach(() => {
  mockReservationCreate.mockReset();
  mockTableFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveCreateReservation', () => {
  const baseInput = {
    guestName: 'John',
    partySize: 4,
    requestedTime: new Date('2026-04-28T19:00:00Z'),
  };

  it('rejects STAFF', async () => {
    await expect(
      resolveCreateReservation(
        {},
        baseInput,
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: { id: 'loc-9', timezone: 'UTC', currency: 'USD' },
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound when tableId is from another location', async () => {
    mockTableFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveCreateReservation({}, { ...baseInput, tableId: 't-other' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('happy path: creates reservation, audits, publishes Reservation+Table channels', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockReservationCreate.mockResolvedValueOnce({ id: 'r-1', tableId: 't-1' });
    await resolveCreateReservation(
      {},
      { ...baseInput, tableId: 't-1' },
      managerCtx,
    );
    const data = mockReservationCreate.mock.calls[0]?.[0].data;
    expect(data.locationId).toBe('loc-9');
    expect(data.kind).toBe('RESERVATION');
    expect(data.status).toBe('PENDING');
    expect(data.createdById).toBe('u-1');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('reservation.created');
    const events = mockPublish.mock.calls.map((c) => c[1].kind);
    expect(events).toContain('ReservationChanged');
    expect(events).toContain('TableChanged');
  });
});
