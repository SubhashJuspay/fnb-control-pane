import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMembershipFindMany } = vi.hoisted(() => ({
  mockMembershipFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    membership: { findMany: mockMembershipFindMany },
  },
}));

import type { RequestContext, AuthContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { buildSchema } from './index.js';
import { resolveTenantMembers } from './membership.js';

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
    prisma: { membership: { findMany: mockMembershipFindMany } } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => mockMembershipFindMany.mockReset());

describe('Membership type', () => {
  it('is registered in the schema with safe relation fields', () => {
    const schema = buildSchema();
    const m = schema.getType('Membership') as unknown as {
      getFields: () => Record<string, unknown>;
    };
    const fields = Object.keys(m.getFields());
    for (const f of ['id', 'role', 'status', 'createdAt', 'user', 'tenant', 'location']) {
      expect(fields).toContain(f);
    }
  });
});

describe('resolveTenantMembers', () => {
  it('throws ForbiddenError for anonymous viewers', async () => {
    await expect(
      resolveTenantMembers({}, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockMembershipFindMany).not.toHaveBeenCalled();
  });

  it('returns memberships scoped to the current tenant', async () => {
    mockMembershipFindMany.mockResolvedValueOnce([{ id: 'm-1' }, { id: 'm-2' }]);
    const result = await resolveTenantMembers(
      {},
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-99', slug: 't' },
        location: null,
        role: 'ADMIN',
      }),
    );
    expect(result).toHaveLength(2);
    const call = mockMembershipFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ tenantId: 't-99' });
  });
});
