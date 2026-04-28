import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReservationFindFirst,
  mockReservationUpdate,
  mockTableFindFirst,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockReservationFindFirst: vi.fn(),
  mockReservationUpdate: vi.fn(),
  mockTableFindFirst: vi.fn(),
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
import { resolveUpdateReservation } from './update-reservation.js';

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
  mockTableFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveUpdateReservation', () => {
  it('NotFound for cross-location', async () => {
    mockReservationFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateReservation({}, { id: 'r-1' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('Conflict when status is COMPLETED', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'COMPLETED',
      tableId: null,
    });
    await expect(
      resolveUpdateReservation({}, { id: 'r-1', notes: 'x' }, managerCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('rejects anonymous', async () => {
    await expect(
      resolveUpdateReservation({}, { id: 'r-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('happy path: updates only provided fields and publishes both old + new tableId', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      status: 'PENDING',
      tableId: 't-old',
    });
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-new' });
    mockReservationUpdate.mockResolvedValueOnce({ id: 'r-1', tableId: 't-new' });
    await resolveUpdateReservation(
      {},
      { id: 'r-1', notes: 'no peanuts', tableId: 't-new' },
      managerCtx,
    );
    expect(mockReservationUpdate.mock.calls[0]?.[0].data).toEqual({
      notes: 'no peanuts',
      tableId: 't-new',
    });
    const tableEvents = mockPublish.mock.calls
      .filter((c) => c[1].kind === 'TableChanged')
      .map((c) => c[1].tableId);
    expect(tableEvents).toContain('t-old');
    expect(tableEvents).toContain('t-new');
  });
});
