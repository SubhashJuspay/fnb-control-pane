import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTimeEntryFindFirst,
  mockBreakFindFirst,
  mockBreakCreate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTimeEntryFindFirst: vi.fn(),
  mockBreakFindFirst: vi.fn(),
  mockBreakCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    timeEntry: { findFirst: mockTimeEntryFindFirst },
    break: { findFirst: mockBreakFindFirst, create: mockBreakCreate },
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
import { resolveStartBreak } from './start-break.js';

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
      timeEntry: { findFirst: mockTimeEntryFindFirst },
      break: { findFirst: mockBreakFindFirst, create: mockBreakCreate },
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
  mockBreakFindFirst.mockReset();
  mockBreakCreate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveStartBreak', () => {
  it('rejects when entry not found', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveStartBreak({}, { timeEntryId: 'te-1' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects when entry is closed', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce({
      id: 'te-1',
      clockedOutAt: new Date(),
      locationId: 'loc-1',
    });
    await expect(
      resolveStartBreak({}, { timeEntryId: 'te-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('rejects when an active break already exists', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce({
      id: 'te-1',
      clockedOutAt: null,
      locationId: 'loc-1',
    });
    mockBreakFindFirst.mockResolvedValueOnce({ id: 'br-old' });
    await expect(
      resolveStartBreak({}, { timeEntryId: 'te-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce({
      id: 'te-1',
      clockedOutAt: null,
      locationId: 'loc-1',
    });
    mockBreakFindFirst.mockResolvedValueOnce(null);
    mockBreakCreate.mockResolvedValueOnce({ id: 'br-1' });
    await resolveStartBreak({}, { timeEntryId: 'te-1' }, staffCtx);
    expect(mockBreakCreate.mock.calls[0]?.[0].data.timeEntryId).toBe('te-1');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'time_entry.break_started',
    );
    expect(mockPublish).toHaveBeenCalled();
  });
});
