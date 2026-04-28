import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockJobRoleFindMany } = vi.hoisted(() => ({
  mockJobRoleFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    jobRole: { findMany: mockJobRoleFindMany },
  },
}));

import type { AuthContext, RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { buildSchema } from './index.js';
import { resolveJobRoles } from './job-role.js';

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
      jobRole: { findMany: mockJobRoleFindMany },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'MANAGER',
});

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockJobRoleFindMany.mockReset();
});

describe('JobRole type', () => {
  it('is registered in the schema', () => {
    const schema = buildSchema();
    expect(schema.getType('JobRole')).toBeTruthy();
  });
});

describe('resolveJobRoles', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveJobRoles({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects STAFF role', async () => {
    await expect(resolveJobRoles({}, staffCtx)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('queries by viewer tenant', async () => {
    mockJobRoleFindMany.mockResolvedValueOnce([]);
    await resolveJobRoles({}, managerCtx);
    const call = mockJobRoleFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ tenantId: 't-1' });
    expect(call.orderBy).toEqual([{ archivedAt: 'asc' }, { name: 'asc' }]);
  });
});
