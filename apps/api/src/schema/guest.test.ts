import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGuestFindMany,
  mockGuestFindFirst,
} = vi.hoisted(() => ({
  mockGuestFindMany: vi.fn(),
  mockGuestFindFirst: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    guest: {
      findMany: mockGuestFindMany,
      findFirst: mockGuestFindFirst,
    },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import {
  buildGuestsWhere,
  buildSearchGuestsWhere,
  resolveGuestById,
  resolveGuestsQuery,
  resolveSearchGuests,
} from './guest.js';

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
      guest: {
        findMany: mockGuestFindMany,
        findFirst: mockGuestFindFirst,
      },
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

const viewerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'VIEWER',
});

beforeEach(() => {
  mockGuestFindMany.mockReset();
  mockGuestFindFirst.mockReset();
});

describe('buildGuestsWhere', () => {
  it('defaults to non-archived', () => {
    const where = buildGuestsWhere('t-1', null);
    expect(where).toEqual({ tenantId: 't-1', archivedAt: null });
  });

  it('archivedOnly flips the filter', () => {
    const where = buildGuestsWhere('t-1', { archivedOnly: true });
    expect(where).toEqual({ tenantId: 't-1', archivedAt: { not: null } });
  });

  it('search adds a name OR phone insensitive contains', () => {
    const where = buildGuestsWhere('t-1', { search: 'ali' });
    expect(where).toMatchObject({
      tenantId: 't-1',
      archivedAt: null,
      OR: [
        { name: { contains: 'ali', mode: 'insensitive' } },
        { phone: { contains: 'ali', mode: 'insensitive' } },
      ],
    });
  });

  it('empty search is ignored', () => {
    const where = buildGuestsWhere('t-1', { search: '   ' });
    expect(where).not.toHaveProperty('OR');
  });
});

describe('buildSearchGuestsWhere', () => {
  it('always restricts to non-archived guests', () => {
    const where = buildSearchGuestsWhere('t-1', '555');
    expect(where).toMatchObject({
      tenantId: 't-1',
      archivedAt: null,
      OR: [
        { name: { contains: '555', mode: 'insensitive' } },
        { phone: { contains: '555', mode: 'insensitive' } },
      ],
    });
  });
});

describe('resolveGuestsQuery', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveGuestsQuery({}, ctxFor({ kind: 'anonymous' }), null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects non-manager (VIEWER)', async () => {
    await expect(resolveGuestsQuery({}, viewerCtx, null)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('manager: scopes findMany to tenant', async () => {
    mockGuestFindMany.mockResolvedValueOnce([{ id: 'g-1' }]);
    await resolveGuestsQuery({}, managerCtx, { search: 'alice' });
    const args = mockGuestFindMany.mock.calls[0]?.[0];
    expect(args.where.tenantId).toBe('t-1');
    expect(args.orderBy).toEqual({ name: 'asc' });
    expect(args.where.OR).toBeDefined();
  });
});

describe('resolveGuestById', () => {
  it('rejects non-manager', async () => {
    await expect(resolveGuestById({}, staffCtx, 'g-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('manager: scopes findFirst to tenant', async () => {
    mockGuestFindFirst.mockResolvedValueOnce({ id: 'g-1' });
    await resolveGuestById({}, managerCtx, 'g-1');
    const args = mockGuestFindFirst.mock.calls[0]?.[0];
    expect(args.where).toEqual({ id: 'g-1', tenantId: 't-1' });
  });
});

describe('resolveSearchGuests', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveSearchGuests({}, ctxFor({ kind: 'anonymous' }), 'a', 10),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('staff: scopes findMany with limit clamp', async () => {
    mockGuestFindMany.mockResolvedValueOnce([]);
    await resolveSearchGuests({}, staffCtx, 'al', 999);
    const args = mockGuestFindMany.mock.calls[0]?.[0];
    expect(args.where.tenantId).toBe('t-1');
    expect(args.take).toBe(50);
  });

  it('clamps minimum take to 1', async () => {
    mockGuestFindMany.mockResolvedValueOnce([]);
    await resolveSearchGuests({}, staffCtx, 'al', 0);
    const args = mockGuestFindMany.mock.calls[0]?.[0];
    expect(args.take).toBe(1);
  });
});
