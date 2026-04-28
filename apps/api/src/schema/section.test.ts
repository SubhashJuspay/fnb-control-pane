import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSectionFindMany } = vi.hoisted(() => ({
  mockSectionFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    section: { findMany: mockSectionFindMany },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { buildSchema } from './index.js';
import { resolveFloorSections } from './section.js';

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
      section: { findMany: mockSectionFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (locationId: string | null = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'STAFF',
  });

beforeEach(() => mockSectionFindMany.mockReset());

describe('Section type', () => {
  it('is registered in the schema', () => {
    const schema = buildSchema();
    expect(schema.getType('Section')).toBeTruthy();
  });
});

describe('resolveFloorSections', () => {
  it('throws ForbiddenError for anonymous viewers', async () => {
    await expect(
      resolveFloorSections({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockSectionFindMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when no location', async () => {
    await expect(resolveFloorSections({}, staffCtx(null))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('returns sections scoped to the viewer location, excludes archived', async () => {
    mockSectionFindMany.mockResolvedValueOnce([{ id: 's-1' }, { id: 's-2' }]);
    const result = await resolveFloorSections({}, staffCtx('loc-9'));
    expect(result).toHaveLength(2);
    const call = mockSectionFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ locationId: 'loc-9', archivedAt: null });
    expect(call.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
  });
});
