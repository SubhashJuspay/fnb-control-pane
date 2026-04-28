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
import { resolveCancelShift } from './cancel-shift.js';

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

describe('resolveCancelShift', () => {
  it('rejects when missing', async () => {
    mockShiftFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveCancelShift({}, { id: 's-1', cancelReason: 'x' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects already cancelled', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({ id: 's-1', status: 'CANCELLED' });
    await expect(
      resolveCancelShift({}, { id: 's-1' }, managerCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('cancels DRAFT or PUBLISHED with reason', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({ id: 's-1', status: 'PUBLISHED' });
    mockShiftUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveCancelShift({}, { id: 's-1', cancelReason: 'sick' }, managerCtx);
    const data = mockShiftUpdate.mock.calls[0]?.[0].data as {
      status: string;
      cancelReason: string;
      cancelledAt: Date;
    };
    expect(data.status).toBe('CANCELLED');
    expect(data.cancelReason).toBe('sick');
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('shift.cancelled');
    expect(mockPublish).toHaveBeenCalled();
  });
});
