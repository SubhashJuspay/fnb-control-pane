import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLocationFindFirst,
  mockTimeEntryFindFirst,
  mockTimeEntryCreate,
  mockShiftFindFirst,
  mockShiftFindMany,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockLocationFindFirst: vi.fn(),
  mockTimeEntryFindFirst: vi.fn(),
  mockTimeEntryCreate: vi.fn(),
  mockShiftFindFirst: vi.fn(),
  mockShiftFindMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    location: { findFirst: mockLocationFindFirst },
    timeEntry: { findFirst: mockTimeEntryFindFirst, create: mockTimeEntryCreate },
    shift: { findFirst: mockShiftFindFirst, findMany: mockShiftFindMany },
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
import { pickShiftToBind, resolvePunchIn } from './punch-in.js';

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
      timeEntry: {
        findFirst: mockTimeEntryFindFirst,
        create: mockTimeEntryCreate,
      },
      shift: { findFirst: mockShiftFindFirst, findMany: mockShiftFindMany },
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
  mockLocationFindFirst.mockReset();
  mockTimeEntryFindFirst.mockReset();
  mockTimeEntryCreate.mockReset();
  mockShiftFindFirst.mockReset();
  mockShiftFindMany.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('pickShiftToBind', () => {
  const now = new Date('2026-04-28T17:00:00Z');
  it('returns null when nothing is in window', () => {
    expect(
      pickShiftToBind(
        [{ id: 's-1', startsAt: new Date('2026-04-28T20:00:00Z') }],
        now,
      ),
    ).toBeNull();
  });
  it('returns the closest shift inside ±60min', () => {
    const out = pickShiftToBind(
      [
        { id: 's-1', startsAt: new Date('2026-04-28T17:45:00Z') },
        { id: 's-2', startsAt: new Date('2026-04-28T16:50:00Z') },
      ],
      now,
    );
    expect(out?.id).toBe('s-2');
  });
});

describe('resolvePunchIn', () => {
  it('rejects when location not in tenant', async () => {
    mockLocationFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolvePunchIn({}, { locationId: 'loc-1' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects when an active entry exists', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1' });
    mockTimeEntryFindFirst.mockResolvedValueOnce({ id: 'te-old' });
    await expect(
      resolvePunchIn({}, { locationId: 'loc-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path without shift binding', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1' });
    mockTimeEntryFindFirst.mockResolvedValueOnce(null);
    mockShiftFindMany.mockResolvedValueOnce([]); // no auto-bind candidates
    mockTimeEntryCreate.mockResolvedValueOnce({ id: 'te-1' });
    await resolvePunchIn({}, { locationId: 'loc-1' }, staffCtx);
    const data = mockTimeEntryCreate.mock.calls[0]?.[0].data as {
      userId: string;
      shiftId: string | null;
    };
    expect(data.userId).toBe('u-1');
    expect(data.shiftId).toBeNull();
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'time_entry.punched_in',
    );
    expect(mockPublish).toHaveBeenCalledWith('schedule_updates_loc-1', {
      kind: 'TimeEntryChanged',
      timeEntryId: 'te-1',
      userId: 'u-1',
    });
  });
  it('explicit shiftId verified before binding', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1' });
    mockTimeEntryFindFirst.mockResolvedValueOnce(null);
    mockShiftFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolvePunchIn({}, { locationId: 'loc-1', shiftId: 's-x' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
