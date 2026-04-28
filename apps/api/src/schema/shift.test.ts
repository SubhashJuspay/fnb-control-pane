import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShiftFindMany, mockShiftFindFirst } = vi.hoisted(() => ({
  mockShiftFindMany: vi.fn(),
  mockShiftFindFirst: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    shift: { findMany: mockShiftFindMany, findFirst: mockShiftFindFirst },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import {
  computeShiftDurationMinutes,
  computeWeekRange,
  resolveMyShifts,
  resolveScheduleForWeek,
  resolveShiftById,
} from './shift.js';

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
      shift: { findMany: mockShiftFindMany, findFirst: mockShiftFindFirst },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const base = {
  kind: 'authenticated' as const,
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
};

const managerCtx: RequestContext = ctxFor({
  ...base,
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'MANAGER',
});
const staffCtx: RequestContext = ctxFor({
  ...base,
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockShiftFindMany.mockReset();
  mockShiftFindFirst.mockReset();
});

describe('computeShiftDurationMinutes', () => {
  it('returns minutes', () => {
    expect(
      computeShiftDurationMinutes({
        startsAt: new Date('2026-04-28T10:00:00Z'),
        endsAt: new Date('2026-04-28T15:30:00Z'),
      }),
    ).toBe(330);
  });
  it('clamps negative to zero', () => {
    expect(
      computeShiftDurationMinutes({
        startsAt: new Date('2026-04-28T15:30:00Z'),
        endsAt: new Date('2026-04-28T10:00:00Z'),
      }),
    ).toBe(0);
  });
});

describe('computeWeekRange', () => {
  it('UTC anchor produces 7-day half-open window', () => {
    const { start, end } = computeWeekRange(new Date('2026-04-27T00:00:00Z'), 'UTC');
    expect(start.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });
});

describe('resolveScheduleForWeek', () => {
  it('rejects STAFF role', async () => {
    await expect(
      resolveScheduleForWeek({}, staffCtx, new Date('2026-04-27T00:00:00Z')),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('queries by viewer location and 7-day window', async () => {
    mockShiftFindMany.mockResolvedValueOnce([]);
    await resolveScheduleForWeek(
      {},
      managerCtx,
      new Date('2026-04-27T00:00:00Z'),
    );
    const where = mockShiftFindMany.mock.calls[0]?.[0].where as {
      locationId: string;
      startsAt: { gte: Date; lt: Date };
    };
    expect(where.locationId).toBe('loc-1');
    expect(where.startsAt.gte.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    expect(where.startsAt.lt.toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });
});

describe('resolveMyShifts', () => {
  it('queries by viewer userId + location', async () => {
    mockShiftFindMany.mockResolvedValueOnce([]);
    await resolveMyShifts({}, staffCtx, null, null);
    expect(mockShiftFindMany.mock.calls[0]?.[0].where).toEqual({
      userId: 'u-1',
      locationId: 'loc-1',
    });
  });
  it('applies from/to window when provided', async () => {
    mockShiftFindMany.mockResolvedValueOnce([]);
    await resolveMyShifts(
      {},
      staffCtx,
      new Date('2026-04-27T00:00:00Z'),
      new Date('2026-05-04T00:00:00Z'),
    );
    const where = mockShiftFindMany.mock.calls[0]?.[0].where as {
      startsAt: { gte: Date; lt: Date };
    };
    expect(where.startsAt.gte.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    expect(where.startsAt.lt.toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });
});

describe('resolveShiftById', () => {
  it('returns null when shift not found', async () => {
    mockShiftFindFirst.mockResolvedValueOnce(null);
    await expect(resolveShiftById({}, managerCtx, 's-1')).resolves.toBeNull();
  });
  it('returns shift to assigned user (self)', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({ id: 's-1', userId: 'u-1' });
    const out = await resolveShiftById({}, staffCtx, 's-1');
    expect(out).toEqual({ id: 's-1', userId: 'u-1' });
  });
  it('rejects when STAFF tries to read another user shift', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({ id: 's-1', userId: 'u-other' });
    await expect(resolveShiftById({}, staffCtx, 's-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
  it('manager can read any shift in location', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({ id: 's-1', userId: 'u-other' });
    const out = await resolveShiftById({}, managerCtx, 's-1');
    expect(out).toEqual({ id: 's-1', userId: 'u-other' });
  });
});
