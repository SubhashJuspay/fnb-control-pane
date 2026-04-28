import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMembershipFindFirst,
  mockJobRoleFindFirst,
  mockShiftFindMany,
  mockShiftCreate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockMembershipFindFirst: vi.fn(),
  mockJobRoleFindFirst: vi.fn(),
  mockShiftFindMany: vi.fn(),
  mockShiftCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    membership: { findFirst: mockMembershipFindFirst },
    jobRole: { findFirst: mockJobRoleFindFirst },
    shift: { findMany: mockShiftFindMany, create: mockShiftCreate },
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
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveCreateShift } from './create-shift.js';

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
      membership: { findFirst: mockMembershipFindFirst },
      jobRole: { findFirst: mockJobRoleFindFirst },
      shift: { findMany: mockShiftFindMany, create: mockShiftCreate },
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

const baseInput = {
  userId: 'u-2',
  jobRoleId: 'jr-1',
  startsAt: new Date('2026-04-28T17:00:00Z'),
  endsAt: new Date('2026-04-28T22:00:00Z'),
};

beforeEach(() => {
  mockMembershipFindFirst.mockReset();
  mockJobRoleFindFirst.mockReset();
  mockShiftFindMany.mockReset();
  mockShiftCreate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveCreateShift', () => {
  it('rejects STAFF role', async () => {
    await expect(resolveCreateShift({}, baseInput, staffCtx)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
  it('rejects when user not in tenant', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    await expect(resolveCreateShift({}, baseInput, managerCtx)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
  it('rejects when job role not in tenant', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'm' });
    mockJobRoleFindFirst.mockResolvedValueOnce(null);
    await expect(resolveCreateShift({}, baseInput, managerCtx)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
  it('rejects when an overlapping shift exists', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'm' });
    mockJobRoleFindFirst.mockResolvedValueOnce({ id: 'jr-1' });
    mockShiftFindMany.mockResolvedValueOnce([
      {
        id: 's-existing',
        userId: 'u-2',
        startsAt: new Date('2026-04-28T18:00:00Z'),
        endsAt: new Date('2026-04-28T23:00:00Z'),
        status: 'PUBLISHED',
      },
    ]);
    await expect(resolveCreateShift({}, baseInput, managerCtx)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
  it('happy path: creates DRAFT, audits, publishes', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'm' });
    mockJobRoleFindFirst.mockResolvedValueOnce({ id: 'jr-1' });
    mockShiftFindMany.mockResolvedValueOnce([]);
    mockShiftCreate.mockResolvedValueOnce({ id: 's-1' });
    await resolveCreateShift({}, baseInput, managerCtx);
    expect(mockShiftCreate.mock.calls[0]?.[0].data).toMatchObject({
      locationId: 'loc-1',
      userId: 'u-2',
      jobRoleId: 'jr-1',
      status: 'DRAFT',
      createdById: 'u-mgr',
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('shift.created');
    expect(mockPublish).toHaveBeenCalledWith('schedule_updates_loc-1', {
      kind: 'ShiftChanged',
      shiftId: 's-1',
    });
  });
});
