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
import { resolveCancelReservation } from './cancel-reservation.js';

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

describe('resolveCancelReservation', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveCancelReservation({}, { id: 'r-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('Conflict when status is SEATED', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'SEATED',
      tableId: 't-1',
    });
    await expect(
      resolveCancelReservation({}, { id: 'r-1' }, managerCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: PENDING -> CANCELLED with reason', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'PENDING',
      tableId: 't-1',
    });
    mockReservationUpdate.mockResolvedValueOnce({ id: 'r-1', tableId: 't-1' });
    await resolveCancelReservation(
      {},
      { id: 'r-1', cancelReason: 'guest unreachable' },
      managerCtx,
    );
    const data = mockReservationUpdate.mock.calls[0]?.[0].data;
    expect(data.status).toBe('CANCELLED');
    expect(data.cancelReason).toBe('guest unreachable');
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('reservation.cancelled');
  });
});
