import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTimeEntryFindMany, mockTimeEntryFindFirst } = vi.hoisted(() => ({
  mockTimeEntryFindMany: vi.fn(),
  mockTimeEntryFindFirst: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    timeEntry: {
      findMany: mockTimeEntryFindMany,
      findFirst: mockTimeEntryFindFirst,
    },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import {
  buildTimeEntriesWhere,
  resolveMyActiveTimeEntry,
  resolveTimeEntries,
} from './time-entry.js';

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
        findMany: mockTimeEntryFindMany,
        findFirst: mockTimeEntryFindFirst,
      },
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
  mockTimeEntryFindMany.mockReset();
  mockTimeEntryFindFirst.mockReset();
});

describe('buildTimeEntriesWhere', () => {
  it('builds locationId-only when no filter', () => {
    expect(buildTimeEntriesWhere('loc-1', undefined)).toEqual({
      locationId: 'loc-1',
    });
  });
  it('applies userId and clockedInAt range', () => {
    const where = buildTimeEntriesWhere('loc-1', {
      userId: 'u-2',
      fromDate: new Date('2026-04-01T00:00:00Z'),
      toDate: new Date('2026-04-30T00:00:00Z'),
    }) as { clockedInAt: { gte: Date; lte: Date }; userId: string };
    expect(where.userId).toBe('u-2');
    expect(where.clockedInAt.gte.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(where.clockedInAt.lte.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });
});

describe('resolveMyActiveTimeEntry', () => {
  it('queries by user + clockedOutAt null', async () => {
    mockTimeEntryFindFirst.mockResolvedValueOnce(null);
    await resolveMyActiveTimeEntry({}, staffCtx);
    expect(mockTimeEntryFindFirst.mock.calls[0]?.[0].where).toEqual({
      userId: 'u-1',
      locationId: 'loc-1',
      clockedOutAt: null,
    });
  });
});

describe('resolveTimeEntries', () => {
  it('rejects STAFF role', async () => {
    await expect(resolveTimeEntries({}, staffCtx, null)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
  it('manager queries scoped to location', async () => {
    mockTimeEntryFindMany.mockResolvedValueOnce([]);
    await resolveTimeEntries({}, managerCtx, null);
    expect(mockTimeEntryFindMany.mock.calls[0]?.[0].where).toEqual({
      locationId: 'loc-1',
    });
    expect(mockTimeEntryFindMany.mock.calls[0]?.[0].orderBy).toEqual({
      clockedInAt: 'desc',
    });
  });
});
