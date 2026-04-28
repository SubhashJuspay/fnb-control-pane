import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReservationFindFirst,
  mockReservationUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockReservationFindFirst: vi.fn(),
  mockReservationUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    reservation: {
      findFirst: mockReservationFindFirst,
      update: mockReservationUpdate,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { resolveMarkNoShow } from './mark-no-show.js';

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
  mockReservationFindFirst.mockReset();
  mockReservationUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveMarkNoShow', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveMarkNoShow(
        {},
        { id: 'r-1' },
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
  it('Conflict when status is not CONFIRMED', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'PENDING',
      requestedTime: new Date('2026-04-28T19:00:00Z'),
      tableId: null,
    });
    await expect(
      resolveMarkNoShow({}, { id: 'r-1' }, managerCtx, new Date('2026-04-28T20:00:00Z')),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('Conflict when requestedTime is in the future', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T20:00:00Z'),
      tableId: null,
    });
    await expect(
      resolveMarkNoShow({}, { id: 'r-1' }, managerCtx, new Date('2026-04-28T19:00:00Z')),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: CONFIRMED + past time -> NO_SHOW', async () => {
    const now = new Date('2026-04-28T20:00:00Z');
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T19:00:00Z'),
      tableId: 't-1',
    });
    mockReservationUpdate.mockResolvedValueOnce({ id: 'r-1', tableId: 't-1' });
    await resolveMarkNoShow({}, { id: 'r-1' }, managerCtx, now);
    expect(mockReservationUpdate.mock.calls[0]?.[0].data).toEqual({
      status: 'NO_SHOW',
      noShowAt: now,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('reservation.no_show');
  });
});
