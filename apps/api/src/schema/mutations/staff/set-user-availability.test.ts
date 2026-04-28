import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTransaction,
  mockDeleteMany,
  mockCreateMany,
  mockFindMany,
  mockMembershipFindFirst,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockFindMany: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    $transaction: mockTransaction,
    membership: { findFirst: mockMembershipFindFirst },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveSetUserAvailability } from './set-user-availability.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

const tx = {
  availabilityWindow: {
    deleteMany: mockDeleteMany,
    createMany: mockCreateMany,
    findMany: mockFindMany,
  },
};

function ctxFor(auth: AuthContext): RequestContext {
  return {
    auth,
    prisma: {
      $transaction: mockTransaction,
      membership: { findFirst: mockMembershipFindFirst },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
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
  mockTransaction.mockReset().mockImplementation(async (fn) => fn(tx));
  mockDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  mockCreateMany.mockReset().mockResolvedValue({ count: 0 });
  mockFindMany.mockReset().mockResolvedValue([]);
  mockMembershipFindFirst.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveSetUserAvailability', () => {
  it('rejects STAFF role', async () => {
    await expect(
      resolveSetUserAvailability({ userId: 'u-2', windows: [] }, staffCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects when user not in tenant', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveSetUserAvailability({ userId: 'u-2', windows: [] }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('replaces windows for target user when in tenant', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'mem-1' });
    await resolveSetUserAvailability(
      {
        userId: 'u-2',
        windows: [{ dayOfWeek: 'WED', startTime: '08:00', endTime: '12:00' }],
      },
      managerCtx,
    );
    expect(mockDeleteMany.mock.calls[0]?.[0].where).toEqual({ userId: 'u-2' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'availability.set',
    );
  });
});
