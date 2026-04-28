import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReservationFindMany, mockReservationFindFirst } = vi.hoisted(() => ({
  mockReservationFindMany: vi.fn(),
  mockReservationFindFirst: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
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
  computeDayRange,
  formatDateInZone,
  resolveReservation,
  resolveReservationsActive,
  resolveReservationsForDay,
  resolveWaitlist,
} from './reservation.js';

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
        findMany: mockReservationFindMany,
        findFirst: mockReservationFindFirst,
      },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (
  locationId: string | null = 'loc-1',
  timezone = 'America/Los_Angeles',
): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: locationId ? { id: locationId, timezone, currency: 'USD' } : null,
    role: 'STAFF',
  });

beforeEach(() => {
  mockReservationFindMany.mockReset();
  mockReservationFindFirst.mockReset();
});

describe('Reservation type', () => {
  it('is registered in the schema', () => {
    const schema = buildSchema();
    expect(schema.getType('Reservation')).toBeTruthy();
    expect(schema.getType('ReservationStatus')).toBeTruthy();
    expect(schema.getType('ReservationKind')).toBeTruthy();
  });
});

describe('computeDayRange', () => {
  it('returns 24h half-open interval starting at local midnight (LA)', () => {
    const { start, end } = computeDayRange('2026-04-28', 'America/Los_Angeles');
    // April 28 LA midnight = April 28 07:00 UTC (PDT, UTC-7).
    expect(start.toISOString()).toBe('2026-04-28T07:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
  it('UTC zone produces simple boundary', () => {
    const { start, end } = computeDayRange('2026-04-28', 'UTC');
    expect(start.toISOString()).toBe('2026-04-28T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-04-29T00:00:00.000Z');
  });
});

describe('formatDateInZone', () => {
  it('formats a UTC date as the LA local calendar date', () => {
    // April 28 03:00 UTC in LA is still April 27 20:00 PDT.
    const d = new Date('2026-04-28T03:00:00Z');
    expect(formatDateInZone(d, 'America/Los_Angeles')).toBe('2026-04-27');
  });
});

describe('resolveReservationsForDay', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveReservationsForDay({}, ctxFor({ kind: 'anonymous' }), new Date()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects when no location', async () => {
    await expect(
      resolveReservationsForDay({}, staffCtx(null), new Date()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('queries by viewer location and computed day range', async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    await resolveReservationsForDay(
      {},
      staffCtx('loc-9', 'UTC'),
      new Date('2026-04-28T12:00:00Z'),
    );
    const call = mockReservationFindMany.mock.calls[0]?.[0];
    expect(call.where.locationId).toBe('loc-9');
    expect(call.where.requestedTime.gte.toISOString()).toBe('2026-04-28T00:00:00.000Z');
    expect(call.where.requestedTime.lt.toISOString()).toBe('2026-04-29T00:00:00.000Z');
    expect(call.orderBy).toEqual({ requestedTime: 'asc' });
  });
});

describe('resolveReservationsActive', () => {
  it('queries for WAITING + SEATED scoped to viewer location', async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    await resolveReservationsActive({}, staffCtx('loc-9'));
    const call = mockReservationFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({
      locationId: 'loc-9',
      status: { in: ['WAITING', 'SEATED'] },
    });
  });
});

describe('resolveWaitlist', () => {
  it('returns WALKIN+WAITING ordered oldest first', async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    await resolveWaitlist({}, staffCtx('loc-9'));
    const call = mockReservationFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({
      locationId: 'loc-9',
      kind: 'WALKIN',
      status: 'WAITING',
    });
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
  });
});

describe('resolveReservation', () => {
  it('returns reservation when it belongs to viewer location', async () => {
    mockReservationFindFirst.mockResolvedValueOnce({ id: 'r-1' });
    const out = await resolveReservation({}, staffCtx('loc-9'), 'r-1');
    expect(out).toEqual({ id: 'r-1' });
    const call = mockReservationFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: 'r-1', locationId: 'loc-9' });
  });
  it('throws ForbiddenError for anonymous', async () => {
    await expect(
      resolveReservation({}, ctxFor({ kind: 'anonymous' }), 'r-1'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
