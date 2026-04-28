import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAvailabilityFindMany, mockMembershipFindFirst } = vi.hoisted(() => ({
  mockAvailabilityFindMany: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    availabilityWindow: { findMany: mockAvailabilityFindMany },
    membership: { findFirst: mockMembershipFindFirst },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import {
  resolveMyAvailability,
  resolveUserAvailability,
  sortAvailability,
} from './availability.js';

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
      availabilityWindow: { findMany: mockAvailabilityFindMany },
      membership: { findFirst: mockMembershipFindFirst },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const base = {
  kind: 'authenticated' as const,
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
};

const managerCtx: RequestContext = ctxFor({ ...base, role: 'MANAGER' });
const staffCtx: RequestContext = ctxFor({ ...base, role: 'STAFF' });

beforeEach(() => {
  mockAvailabilityFindMany.mockReset();
  mockMembershipFindFirst.mockReset();
});

describe('sortAvailability', () => {
  it('orders by day then startTime', () => {
    const out = sortAvailability([
      { dayOfWeek: 'WED', startTime: '08:00' },
      { dayOfWeek: 'MON', startTime: '14:00' },
      { dayOfWeek: 'MON', startTime: '08:00' },
    ]);
    expect(out.map((w) => `${w.dayOfWeek} ${w.startTime}`)).toEqual([
      'MON 08:00',
      'MON 14:00',
      'WED 08:00',
    ]);
  });
});

describe('resolveMyAvailability', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveMyAvailability({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('queries by viewer userId', async () => {
    mockAvailabilityFindMany.mockResolvedValueOnce([]);
    await resolveMyAvailability({}, staffCtx);
    expect(mockAvailabilityFindMany.mock.calls[0]?.[0].where).toEqual({
      userId: 'u-1',
    });
  });
});

describe('resolveUserAvailability', () => {
  it('rejects STAFF role', async () => {
    await expect(
      resolveUserAvailability({}, staffCtx, 'u-2'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects when target user not in tenant', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUserAvailability({}, managerCtx, 'u-2'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('queries by target userId when in tenant', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockAvailabilityFindMany.mockResolvedValueOnce([]);
    await resolveUserAvailability({}, managerCtx, 'u-2');
    expect(mockAvailabilityFindMany.mock.calls[0]?.[0].where).toEqual({
      userId: 'u-2',
    });
  });
});
