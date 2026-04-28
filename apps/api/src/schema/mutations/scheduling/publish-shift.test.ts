import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockShiftFindFirst,
  mockShiftUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockShiftFindFirst: vi.fn(),
  mockShiftUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    shift: { findFirst: mockShiftFindFirst, update: mockShiftUpdate },
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
import { resolvePublishShift } from './publish-shift.js';

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
      shift: { findFirst: mockShiftFindFirst, update: mockShiftUpdate },
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

beforeEach(() => {
  mockShiftFindFirst.mockReset();
  mockShiftUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolvePublishShift', () => {
  it('rejects when not found', async () => {
    mockShiftFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolvePublishShift({}, { id: 's-1' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects non-DRAFT', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({ id: 's-1', status: 'PUBLISHED' });
    await expect(
      resolvePublishShift({}, { id: 's-1' }, managerCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('publishes DRAFT, audits, emits event', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({ id: 's-1', status: 'DRAFT' });
    mockShiftUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolvePublishShift({}, { id: 's-1' }, managerCtx);
    expect(mockShiftUpdate.mock.calls[0]?.[0].data).toEqual({ status: 'PUBLISHED' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('shift.published');
    expect(mockPublish).toHaveBeenCalledWith('schedule_updates_loc-1', {
      kind: 'ShiftChanged',
      shiftId: 's-1',
    });
  });
});
