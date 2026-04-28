import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBreakFindFirst,
  mockBreakUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockBreakFindFirst: vi.fn(),
  mockBreakUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    break: { findFirst: mockBreakFindFirst, update: mockBreakUpdate },
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
import { resolveEndBreak } from './end-break.js';

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
      break: { findFirst: mockBreakFindFirst, update: mockBreakUpdate },
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
  mockBreakFindFirst.mockReset();
  mockBreakUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveEndBreak', () => {
  it('rejects when break not found', async () => {
    mockBreakFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveEndBreak({}, { breakId: 'br-1' }, staffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects when already ended', async () => {
    mockBreakFindFirst.mockResolvedValueOnce({
      id: 'br-1',
      endedAt: new Date(),
      timeEntry: { id: 'te-1', locationId: 'loc-1' },
    });
    await expect(
      resolveEndBreak({}, { breakId: 'br-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path closes break', async () => {
    mockBreakFindFirst.mockResolvedValueOnce({
      id: 'br-1',
      endedAt: null,
      timeEntry: { id: 'te-1', locationId: 'loc-1' },
    });
    mockBreakUpdate.mockResolvedValueOnce({ id: 'br-1' });
    await resolveEndBreak({}, { breakId: 'br-1' }, staffCtx);
    expect(mockBreakUpdate.mock.calls[0]?.[0].data.endedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'time_entry.break_ended',
    );
    expect(mockPublish).toHaveBeenCalled();
  });
});
