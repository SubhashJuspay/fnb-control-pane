import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTimeEntryFindFirst,
  mockTimeEntryUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTimeEntryFindFirst: vi.fn(),
  mockTimeEntryUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    timeEntry: {
      findFirst: mockTimeEntryFindFirst,
      update: mockTimeEntryUpdate,
    },
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
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveEditTimeEntry } from './edit-time-entry.js';

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
      auditLog: { create: mockAuditCreate },
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
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

const baseInput = {
  id: 'te-1',
  clockedInAt: new Date('2026-04-28T17:00:00Z'),
  clockedOutAt: new Date('2026-04-28T22:00:00Z'),
  manualEditReason: 'Forgot to punch out',
};

describe('resolveEditTimeEntry', () => {
  it('rejects STAFF role', async () => {
    await expect(
      resolveEditTimeEntry({}, baseInput, staffCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects when not found', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveEditTimeEntry({}, baseInput, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('sets manualEdit metadata and publishes', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce({ id: 'te-1', userId: 'u-1' });
    mockTimeEntryUpdate.mockResolvedValueOnce({ id: 'te-1' });
    await resolveEditTimeEntry({}, baseInput, managerCtx);
    const data = mockTimeEntryUpdate.mock.calls[0]?.[0].data as {
      manualEdit: boolean;
      manualEditById: string;
      manualEditReason: string;
    };
    expect(data.manualEdit).toBe(true);
    expect(data.manualEditById).toBe('u-mgr');
    expect(data.manualEditReason).toBe('Forgot to punch out');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'time_entry.manually_edited',
    );
    expect(mockPublish).toHaveBeenCalledWith('schedule_updates_loc-1', {
      kind: 'TimeEntryChanged',
      timeEntryId: 'te-1',
      userId: 'u-1',
    });
  });
});
