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
import { resolveUpdateMembershipRole } from './update-membership-role.js';

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

describe('resolveUpdateMembershipRole', () => {
  it('throws ForbiddenError for STAFF', async () => {
    await expect(
      resolveUpdateMembershipRole(
        {},
        { membershipId: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' },
        ctxFor({ ...ownerAuth, role: 'STAFF' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when membership is in another tenant', async () => {
    mockMembershipFindUnique.mockResolvedValueOnce({
      id: 'm-1',
      tenantId: 't-other',
      role: 'STAFF',
    });
    await expect(
      resolveUpdateMembershipRole(
        {},
        { membershipId: '00000000-0000-0000-0000-000000000001', role: 'MANAGER' },
        ctxFor(ownerAuth),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to demote the last active OWNER', async () => {
    mockMembershipFindUnique.mockResolvedValueOnce({ id: 'm-1', tenantId: 't-1', role: 'OWNER' });
    mockMembershipCount.mockResolvedValueOnce(1);
    await expect(
      resolveUpdateMembershipRole(
        {},
        { membershipId: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' },
        ctxFor(ownerAuth),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updates the role and writes audit on success', async () => {
    mockMembershipFindUnique.mockResolvedValueOnce({ id: 'm-1', tenantId: 't-1', role: 'STAFF' });
    mockMembershipUpdate.mockResolvedValueOnce({ id: 'm-1', role: 'MANAGER' });
    mockAuditCreate.mockResolvedValueOnce({ id: 'a-1' });
    const result = await resolveUpdateMembershipRole(
      {},
      { membershipId: '00000000-0000-0000-0000-000000000001', role: 'MANAGER' },
      ctxFor(ownerAuth),
    );
    expect(result).toEqual({ id: 'm-1', role: 'MANAGER' });
    expect(mockMembershipUpdate.mock.calls[0]?.[0].data).toEqual({ role: 'MANAGER' });
    const audit = mockAuditCreate.mock.calls[0]?.[0];
    expect(audit.data.metadata).toMatchObject({ previousRole: 'STAFF', newRole: 'MANAGER' });
  });
});
