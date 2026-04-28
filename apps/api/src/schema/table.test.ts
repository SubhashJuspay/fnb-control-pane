import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTableFindMany,
  mockTicketCount,
  mockReservationFindMany,
  mockTicketFindFirst,
  mockReservationFindFirst,
} = vi.hoisted(() => ({
  mockTableFindMany: vi.fn(),
  mockTicketCount: vi.fn(),
  mockReservationFindMany: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockReservationFindFirst: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    table: { findMany: mockTableFindMany },
    ticket: { count: mockTicketCount, findFirst: mockTicketFindFirst },
    reservation: {
      findMany: mockReservationFindMany,
      findFirst: mockReservationFindFirst,
    },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { buildSchema } from './index.js';
import {
  resolveActiveTicket,
  resolveFloorTables,
  resolveTableState,
  resolveUpcomingReservation,
} from './table.js';

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
      table: { findMany: mockTableFindMany },
      ticket: { count: mockTicketCount, findFirst: mockTicketFindFirst },
      reservation: {
        findMany: mockReservationFindMany,
        findFirst: mockReservationFindFirst,
      },
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
  mockTableFindMany.mockReset();
  mockTicketCount.mockReset();
  mockReservationFindMany.mockReset();
  mockTicketFindFirst.mockReset();
  mockReservationFindFirst.mockReset();
});

describe('Table type', () => {
  it('is registered in the schema', () => {
    const schema = buildSchema();
    expect(schema.getType('Table')).toBeTruthy();
    expect(schema.getType('TableState')).toBeTruthy();
    expect(schema.getType('TableShape')).toBeTruthy();
  });
});

describe('resolveFloorTables', () => {
  it('throws ForbiddenError for anonymous viewers', async () => {
    await expect(
      resolveFloorTables({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('throws when no location', async () => {
    await expect(resolveFloorTables({}, staffCtx(null))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
  it('returns tables scoped to viewer location, archived excluded', async () => {
    mockTableFindMany.mockResolvedValueOnce([{ id: 't-1' }]);
    await resolveFloorTables({}, staffCtx('loc-9'));
    const call = mockTableFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ locationId: 'loc-9', archivedAt: null });
  });
});

describe('resolveTableState', () => {
  it('returns CLEANING when manualState=CLEANING regardless', async () => {
    const out = await resolveTableState(
      { id: 't-1', manualState: 'CLEANING' },
      staffCtx(),
    );
    expect(out).toBe('CLEANING');
    expect(mockTicketCount).toHaveBeenCalledTimes(1);
    expect(mockReservationFindMany).not.toHaveBeenCalled();
  });
  it('returns OCCUPIED when an open ticket is bound', async () => {
    mockTicketCount.mockResolvedValueOnce(1);
    const out = await resolveTableState(
      { id: 't-1', manualState: 'NONE' },
      staffCtx(),
    );
    expect(out).toBe('OCCUPIED');
    expect(mockReservationFindMany).not.toHaveBeenCalled();
  });
  it('returns RESERVED when a reservation is imminent', async () => {
    const now = new Date('2026-04-28T19:00:00Z');
    mockTicketCount.mockResolvedValueOnce(0);
    mockReservationFindMany.mockResolvedValueOnce([
      { status: 'CONFIRMED', requestedTime: new Date('2026-04-28T19:05:00Z') },
    ]);
    const out = await resolveTableState(
      { id: 't-1', manualState: 'NONE' },
      staffCtx(),
      now,
    );
    expect(out).toBe('RESERVED');
  });
  it('returns AVAILABLE when nothing applies', async () => {
    const now = new Date('2026-04-28T19:00:00Z');
    mockTicketCount.mockResolvedValueOnce(0);
    mockReservationFindMany.mockResolvedValueOnce([]);
    const out = await resolveTableState(
      { id: 't-1', manualState: 'NONE' },
      staffCtx(),
      now,
    );
    expect(out).toBe('AVAILABLE');
  });
});

describe('resolveActiveTicket', () => {
  it('returns the OPEN ticket bound to the table or null', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-1' });
    const out = await resolveActiveTicket({ id: 't-1' }, staffCtx());
    expect(out).toEqual({ id: 'tk-1' });
    const call = mockTicketFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ tableId: 't-1', status: 'OPEN' });
  });
});

describe('resolveUpcomingReservation', () => {
  it('returns the next PENDING/CONFIRMED reservation in the next 2h', async () => {
    const now = new Date('2026-04-28T19:00:00Z');
    mockReservationFindFirst.mockResolvedValueOnce({ id: 'r-1' });
    const out = await resolveUpcomingReservation({ id: 't-1' }, staffCtx(), now);
    expect(out).toEqual({ id: 'r-1' });
    const call = mockReservationFindFirst.mock.calls[0]?.[0];
    expect(call.where.tableId).toBe('t-1');
    expect(call.where.status).toEqual({ in: ['PENDING', 'CONFIRMED'] });
    expect(call.orderBy).toEqual({ requestedTime: 'asc' });
  });
});
