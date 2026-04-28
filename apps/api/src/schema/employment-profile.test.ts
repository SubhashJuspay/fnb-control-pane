import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockProfileFindMany, mockProfileFindFirst } = vi.hoisted(() => ({
  mockProfileFindMany: vi.fn(),
  mockProfileFindFirst: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    employmentProfile: {
      findMany: mockProfileFindMany,
      findFirst: mockProfileFindFirst,
    },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import {
  resolveEmploymentProfile,
  resolveStaffRoster,
} from './employment-profile.js';

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
      employmentProfile: {
        findMany: mockProfileFindMany,
        findFirst: mockProfileFindFirst,
      },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const baseAuth = {
  kind: 'authenticated' as const,
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
};

const managerCtx: RequestContext = ctxFor({ ...baseAuth, role: 'MANAGER' });
const adminCtx: RequestContext = ctxFor({ ...baseAuth, role: 'ADMIN' });
const staffCtx: RequestContext = ctxFor({ ...baseAuth, role: 'STAFF' });

beforeEach(() => {
  mockProfileFindMany.mockReset();
  mockProfileFindFirst.mockReset();
});

describe('resolveStaffRoster', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveStaffRoster({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects STAFF role', async () => {
    await expect(resolveStaffRoster({}, staffCtx)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
  it('scopes by viewer location', async () => {
    mockProfileFindMany.mockResolvedValueOnce([]);
    await resolveStaffRoster({}, managerCtx);
    expect(mockProfileFindMany.mock.calls[0]?.[0].where).toEqual({
      locationId: 'loc-1',
    });
  });
});

describe('resolveEmploymentProfile', () => {
  it('admin can read any user', async () => {
    mockProfileFindFirst.mockResolvedValueOnce({ id: 'ep-1' });
    await resolveEmploymentProfile({}, adminCtx, 'u-other');
    expect(mockProfileFindFirst.mock.calls[0]?.[0].where).toEqual({
      userId: 'u-other',
      locationId: 'loc-1',
    });
  });
  it('staff can read own profile', async () => {
    mockProfileFindFirst.mockResolvedValueOnce({ id: 'ep-1' });
    await resolveEmploymentProfile({}, staffCtx, 'u-1');
    expect(mockProfileFindFirst).toHaveBeenCalled();
  });
  it('staff cannot read another user profile', async () => {
    await expect(
      resolveEmploymentProfile({}, staffCtx, 'u-other'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
