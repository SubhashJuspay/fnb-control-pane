import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTransaction,
  mockDeleteMany,
  mockCreateMany,
  mockFindMany,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockFindMany: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    $transaction: mockTransaction,
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { resolveSetMyAvailability } from './set-my-availability.js';

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
  mockTransaction.mockReset().mockImplementation(async (fn) => fn(tx));
  mockDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  mockCreateMany.mockReset().mockResolvedValue({ count: 0 });
  mockFindMany.mockReset().mockResolvedValue([]);
  mockAuditCreate.mockReset();
});

describe('resolveSetMyAvailability', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveSetMyAvailability({ windows: [] }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('replaces all windows for self atomically', async () => {
    await resolveSetMyAvailability(
      {
        windows: [
          { dayOfWeek: 'MON', startTime: '08:00', endTime: '12:00' },
          { dayOfWeek: 'TUE', startTime: '09:00', endTime: '13:00' },
        ],
      },
      staffCtx,
    );
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeleteMany.mock.calls[0]?.[0].where).toEqual({ userId: 'u-1' });
    const created = mockCreateMany.mock.calls[0]?.[0].data as Array<unknown>;
    expect(created).toHaveLength(2);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'availability.set',
    );
  });
  it('skips createMany when windows empty', async () => {
    await resolveSetMyAvailability({ windows: [] }, staffCtx);
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});
