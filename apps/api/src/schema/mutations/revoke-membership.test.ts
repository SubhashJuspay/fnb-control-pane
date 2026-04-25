import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMembershipFindUnique, mockMembershipCount, mockMembershipUpdate, mockAuditCreate } =
  vi.hoisted(() => ({
    mockMembershipFindUnique: vi.fn(),
    mockMembershipCount: vi.fn(),
    mockMembershipUpdate: vi.fn(),
    mockAuditCreate: vi.fn(),
  }));

vi.mock('../../prisma.js', () => ({
  prisma: {
    membership: {
      findUnique: mockMembershipFindUnique,
      count: mockMembershipCount,
      update: mockMembershipUpdate,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import { resolveRevokeMembership } from './revoke-membership.js';

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
      membership: {
        findUnique: mockMembershipFindUnique,
        count: mockMembershipCount,
        update: mockMembershipUpdate,
      },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const ownerAuth: AuthContext = {
  kind: 'authenticated',
  user: { id: 'u-owner', email: 'o@t' },
  tenant: { id: 't-1', slug: 't' },
  location: null,
  role: 'OWNER',
};

beforeEach(() => {
  mockMembershipFindUnique.mockReset();
  mockMembershipCount.mockReset();
  mockMembershipUpdate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveRevokeMembership', () => {
  it('throws ForbiddenError for STAFF', async () => {
    await expect(
      resolveRevokeMembership(
        {},
        { membershipId: '00000000-0000-0000-0000-000000000001' },
        ctxFor({ ...ownerAuth, role: 'STAFF' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when membership belongs to another tenant', async () => {
    mockMembershipFindUnique.mockResolvedValueOnce({
      id: 'm-x',
      tenantId: 't-other',
      role: 'STAFF',
      status: 'ACTIVE',
    });
    await expect(
      resolveRevokeMembership(
        {},
        { membershipId: '00000000-0000-0000-0000-000000000001' },
        ctxFor(ownerAuth),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to revoke the last active OWNER', async () => {
    mockMembershipFindUnique.mockResolvedValueOnce({
      id: 'm-1',
      tenantId: 't-1',
      role: 'OWNER',
      status: 'ACTIVE',
    });
    mockMembershipCount.mockResolvedValueOnce(1);
    await expect(
      resolveRevokeMembership(
        {},
        { membershipId: '00000000-0000-0000-0000-000000000001' },
        ctxFor(ownerAuth),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockMembershipUpdate).not.toHaveBeenCalled();
  });

  it('revokes a non-owner membership and writes audit', async () => {
    mockMembershipFindUnique.mockResolvedValueOnce({
      id: 'm-1',
      tenantId: 't-1',
      role: 'STAFF',
      status: 'ACTIVE',
    });
    mockMembershipUpdate.mockResolvedValueOnce({ id: 'm-1', status: 'REVOKED' });
    mockAuditCreate.mockResolvedValueOnce({ id: 'a-1' });
    const result = await resolveRevokeMembership(
      {},
      { membershipId: '00000000-0000-0000-0000-000000000001' },
      ctxFor(ownerAuth),
    );
    expect(result).toEqual({ id: 'm-1', status: 'REVOKED' });
    expect(mockMembershipUpdate.mock.calls[0]?.[0].data).toEqual({ status: 'REVOKED' });
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });
});
