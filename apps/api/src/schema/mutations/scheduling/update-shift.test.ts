import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockShiftFindFirst,
  mockShiftFindMany,
  mockShiftUpdate,
  mockMembershipFindFirst,
  mockJobRoleFindFirst,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockShiftFindFirst: vi.fn(),
  mockShiftFindMany: vi.fn(),
  mockShiftUpdate: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
  mockJobRoleFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    shift: {
      findFirst: mockShiftFindFirst,
      findMany: mockShiftFindMany,
      update: mockShiftUpdate,
    },
    membership: { findFirst: mockMembershipFindFirst },
    jobRole: { findFirst: mockJobRoleFindFirst },
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
import { resolveUpdateShift } from './update-shift.js';

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
      shift: {
        findFirst: mockShiftFindFirst,
        findMany: mockShiftFindMany,
        update: mockShiftUpdate,
      },
      membership: { findFirst: mockMembershipFindFirst },
      jobRole: { findFirst: mockJobRoleFindFirst },
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
  mockShiftFindMany.mockReset();
  mockShiftUpdate.mockReset();
  mockMembershipFindFirst.mockReset();
  mockJobRoleFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveUpdateShift', () => {
  it('rejects when shift missing', async () => {
    mockShiftFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateShift(
        {},
        { id: 's-1', notes: 'x' },
        managerCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('overlap detection excludes self', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({
      id: 's-1',
      userId: 'u-2',
      jobRoleId: 'jr-1',
      startsAt: new Date('2026-04-28T17:00:00Z'),
      endsAt: new Date('2026-04-28T22:00:00Z'),
      status: 'DRAFT',
    });
    mockShiftFindMany.mockResolvedValueOnce([
      // Self should NOT count as overlap.
      {
        id: 's-1',
        userId: 'u-2',
        startsAt: new Date('2026-04-28T17:00:00Z'),
        endsAt: new Date('2026-04-28T22:00:00Z'),
        status: 'DRAFT',
      },
    ]);
    mockShiftUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveUpdateShift(
      {},
      { id: 's-1', notes: 'updated' },
      managerCtx,
    );
    expect(mockShiftUpdate).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith('schedule_updates_loc-1', {
      kind: 'ShiftChanged',
      shiftId: 's-1',
    });
  });
  it('rejects when an overlapping different shift exists', async () => {
    mockShiftFindFirst.mockResolvedValueOnce({
      id: 's-1',
      userId: 'u-2',
      jobRoleId: 'jr-1',
      startsAt: new Date('2026-04-28T17:00:00Z'),
      endsAt: new Date('2026-04-28T22:00:00Z'),
      status: 'DRAFT',
    });
    mockShiftFindMany.mockResolvedValueOnce([
      {
        id: 's-2',
        userId: 'u-2',
        startsAt: new Date('2026-04-28T20:00:00Z'),
        endsAt: new Date('2026-04-28T23:00:00Z'),
        status: 'PUBLISHED',
      },
    ]);
    await expect(
      resolveUpdateShift({}, { id: 's-1' }, managerCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
