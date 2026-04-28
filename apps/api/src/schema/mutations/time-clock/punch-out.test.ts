import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTimeEntryFindFirst,
  mockTimeEntryUpdate,
  mockBreakFindMany,
  mockBreakUpdateMany,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTimeEntryFindFirst: vi.fn(),
  mockTimeEntryUpdate: vi.fn(),
  mockBreakFindMany: vi.fn(),
  mockBreakUpdateMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    timeEntry: {
      findFirst: mockTimeEntryFindFirst,
      update: mockTimeEntryUpdate,
    },
    break: { findMany: mockBreakFindMany, updateMany: mockBreakUpdateMany },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
  scheduleChannelName: (id: string) => `schedule_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, NotFoundError } from '../../../errors.js';
import { resolvePunchOut, sumBreakMinutes } from './punch-out.js';

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
      timeEntry: {
        findFirst: mockTimeEntryFindFirst,
        update: mockTimeEntryUpdate,
      },
      break: { findMany: mockBreakFindMany, updateMany: mockBreakUpdateMany },
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
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockTimeEntryFindFirst.mockReset();
  mockTimeEntryUpdate.mockReset();
  mockBreakFindMany.mockReset();
  mockBreakUpdateMany.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('sumBreakMinutes', () => {
  it('sums closed breaks; treats open as ending now', () => {
    const now = new Date('2026-04-28T18:00:00Z');
    const minutes = sumBreakMinutes(
      [
        {
          startedAt: new Date('2026-04-28T17:00:00Z'),
          endedAt: new Date('2026-04-28T17:15:00Z'),
        },
        { startedAt: new Date('2026-04-28T17:50:00Z'), endedAt: null },
      ],
      now,
    );
    // 15 + 10 = 25
    expect(minutes).toBe(25);
  });
});

describe('resolvePunchOut', () => {
  it('rejects when not found', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolvePunchOut({}, { timeEntryId: 'te-1' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects when already closed', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce({
      id: 'te-1',
      clockedOutAt: new Date(),
      locationId: 'loc-1',
    });
    await expect(
      resolvePunchOut({}, { timeEntryId: 'te-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('closes entry, sums breaks, audits, publishes', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce({
      id: 'te-1',
      clockedOutAt: null,
      locationId: 'loc-1',
    });
    mockBreakFindMany
      .mockResolvedValueOnce([
        {
          startedAt: new Date('2026-04-28T17:00:00Z'),
          endedAt: new Date('2026-04-28T17:15:00Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    mockBreakUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockTimeEntryUpdate.mockResolvedValueOnce({ id: 'te-1' });
    await resolvePunchOut({}, { timeEntryId: 'te-1' }, staffCtx);
    const data = mockTimeEntryUpdate.mock.calls[0]?.[0].data as {
      clockedOutAt: Date;
      totalBreakMinutes: number;
    };
    expect(data.clockedOutAt).toBeInstanceOf(Date);
    expect(data.totalBreakMinutes).toBe(15);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'time_entry.punched_out',
    );
    expect(mockPublish).toHaveBeenCalled();
  });
});
