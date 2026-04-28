import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLocationFindFirst,
  mockShiftFindMany,
  mockShiftCreate,
  mockTransaction,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockLocationFindFirst: vi.fn(),
  mockShiftFindMany: vi.fn(),
  mockShiftCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    location: { findFirst: mockLocationFindFirst },
    shift: { findMany: mockShiftFindMany },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
  scheduleChannelName: (id: string) => `schedule_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import {
  computeWeekOffsetMs,
  resolveDuplicateWeek,
} from './duplicate-week.js';

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
      location: { findFirst: mockLocationFindFirst },
      shift: { findMany: mockShiftFindMany },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-mgr', email: 'm@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'MANAGER',
});

beforeEach(() => {
  mockLocationFindFirst.mockReset();
  mockShiftFindMany.mockReset();
  mockShiftCreate.mockReset();
  mockAuditCreate.mockReset();
  mockTransaction.mockReset();
  mockPublish.mockClear();
});

describe('computeWeekOffsetMs', () => {
  it('returns target - source ms', () => {
    expect(
      computeWeekOffsetMs(
        new Date('2026-04-27T00:00:00Z'),
        new Date('2026-05-04T00:00:00Z'),
      ),
    ).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('resolveDuplicateWeek', () => {
  it('returns [] when no PUBLISHED source shifts', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1', timezone: 'UTC' });
    mockShiftFindMany.mockResolvedValueOnce([]);
    const out = await resolveDuplicateWeek(
      {
        locationId: 'loc-1',
        weekStart: new Date('2026-04-27T00:00:00Z'),
        targetWeekStart: new Date('2026-05-04T00:00:00Z'),
      },
      managerCtx,
    );
    expect(out).toEqual([]);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'schedule.week_duplicated',
    );
  });
  it('shifts source week to target week as DRAFT', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1', timezone: 'UTC' });
    mockShiftFindMany.mockResolvedValueOnce([
      {
        userId: 'u-2',
        jobRoleId: 'jr-1',
        startsAt: new Date('2026-04-28T17:00:00Z'),
        endsAt: new Date('2026-04-28T22:00:00Z'),
        notes: null,
      },
    ]);
    const txCreate = vi.fn().mockResolvedValue({ id: 's-new' });
    const txFindMany = vi.fn().mockResolvedValueOnce([{ id: 's-new' }]);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ shift: { create: txCreate, findMany: txFindMany } }),
    );
    await resolveDuplicateWeek(
      {
        locationId: 'loc-1',
        weekStart: new Date('2026-04-27T00:00:00Z'),
        targetWeekStart: new Date('2026-05-04T00:00:00Z'),
      },
      managerCtx,
    );
    const created = txCreate.mock.calls[0]?.[0].data as {
      status: string;
      startsAt: Date;
      endsAt: Date;
    };
    expect(created.status).toBe('DRAFT');
    expect(created.startsAt.toISOString()).toBe('2026-05-05T17:00:00.000Z');
    expect(created.endsAt.toISOString()).toBe('2026-05-05T22:00:00.000Z');
    expect(mockPublish).toHaveBeenCalledWith('schedule_updates_loc-1', {
      kind: 'ShiftChanged',
      shiftId: 's-new',
    });
  });
});
