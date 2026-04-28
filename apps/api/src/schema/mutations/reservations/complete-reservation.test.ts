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
import { resolveCompleteReservation } from './complete-reservation.js';

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

describe('resolveCompleteReservation', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveCompleteReservation(
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
  it('Conflict when status is not SEATED', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'PENDING',
      tableId: null,
    });
    await expect(
      resolveCompleteReservation({}, { id: 'r-1' }, managerCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: SEATED -> COMPLETED', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'SEATED',
      tableId: 't-1',
    });
    mockReservationUpdate.mockResolvedValueOnce({ id: 'r-1', tableId: 't-1' });
    await resolveCompleteReservation({}, { id: 'r-1' }, managerCtx);
    const data = mockReservationUpdate.mock.calls[0]?.[0].data;
    expect(data.status).toBe('COMPLETED');
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('reservation.completed');
  });
});
