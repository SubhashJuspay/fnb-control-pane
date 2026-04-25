import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockInvitationFindUnique,
  mockInvitationUpdate,
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockUserFindUniqueOrThrow,
  mockMembershipFindFirst,
  mockMembershipCreate,
  mockMembershipUpdate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockInvitationFindUnique: vi.fn(),
  mockInvitationUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserFindUniqueOrThrow: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
  mockMembershipCreate: vi.fn(),
  mockMembershipUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  prisma: {
    invitation: { findUnique: mockInvitationFindUnique, update: mockInvitationUpdate },
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      findUniqueOrThrow: mockUserFindUniqueOrThrow,
    },
    membership: {
      findFirst: mockMembershipFindFirst,
      create: mockMembershipCreate,
      update: mockMembershipUpdate,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { RequestContext } from '../../context.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import { hashToken } from '../../tokens.js';
import { resolveAcceptInvitation } from './accept-invitation.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

function anonCtx(): RequestContext {
  return {
    auth: { kind: 'anonymous' },
    prisma: {
      invitation: { findUnique: mockInvitationFindUnique, update: mockInvitationUpdate },
      user: {
        findUnique: mockUserFindUnique,
        create: mockUserCreate,
        update: mockUserUpdate,
        findUniqueOrThrow: mockUserFindUniqueOrThrow,
      },
      membership: {
        findFirst: mockMembershipFindFirst,
        create: mockMembershipCreate,
        update: mockMembershipUpdate,
      },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  for (const fn of [
    mockInvitationFindUnique,
    mockInvitationUpdate,
    mockUserFindUnique,
    mockUserCreate,
    mockUserUpdate,
    mockUserFindUniqueOrThrow,
    mockMembershipFindFirst,
    mockMembershipCreate,
    mockMembershipUpdate,
    mockAuditCreate,
  ]) {
    fn.mockReset();
  }
});

describe('resolveAcceptInvitation', () => {
  it('throws NotFoundError when token does not match any invitation', async () => {
    mockInvitationFindUnique.mockResolvedValueOnce(null);
    await expect(
      resolveAcceptInvitation(
        {},
        { token: 'a'.repeat(40), name: 'Bob', password: 'password1' },
        anonCtx(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ConflictError when invitation already accepted', async () => {
    mockInvitationFindUnique.mockResolvedValueOnce({
      id: 'inv-1',
      tenantId: 't-1',
      locationId: null,
      email: 'a@b',
      role: 'STAFF',
      acceptedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      resolveAcceptInvitation(
        {},
        { token: 'a'.repeat(40), name: 'Bob', password: 'password1' },
        anonCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when invitation has expired', async () => {
    mockInvitationFindUnique.mockResolvedValueOnce({
      id: 'inv-1',
      tenantId: 't-1',
      locationId: null,
      email: 'a@b',
      role: 'STAFF',
      acceptedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(
      resolveAcceptInvitation(
        {},
        { token: 'a'.repeat(40), name: 'Bob', password: 'password1' },
        anonCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates user + membership and marks invitation accepted on happy path', async () => {
    const token = 'a'.repeat(40);
    mockInvitationFindUnique.mockResolvedValueOnce({
      id: 'inv-1',
      tenantId: 't-1',
      locationId: 'loc-1',
      email: 'new@b',
      role: 'STAFF',
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce({ id: 'u-new' });
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    mockMembershipCreate.mockResolvedValueOnce({ id: 'm-1' });
    mockInvitationUpdate.mockResolvedValueOnce({ id: 'inv-1' });
    mockAuditCreate.mockResolvedValueOnce({ id: 'a-1' });
    mockUserFindUniqueOrThrow.mockResolvedValueOnce({ id: 'u-new', email: 'new@b' });

    const result = await resolveAcceptInvitation(
      {},
      { token, name: 'Bob', password: 'password1' },
      anonCtx(),
    );
    expect(result).toEqual({ id: 'u-new', email: 'new@b' });
    expect(mockInvitationFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(token) },
    });
    expect(mockUserCreate).toHaveBeenCalledTimes(1);
    expect(mockMembershipCreate).toHaveBeenCalledTimes(1);
    const memCall = mockMembershipCreate.mock.calls[0]?.[0];
    expect(memCall.data).toEqual({
      userId: 'u-new',
      tenantId: 't-1',
      locationId: 'loc-1',
      role: 'STAFF',
    });
    expect(mockInvitationUpdate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const audit = mockAuditCreate.mock.calls[0]?.[0];
    expect(audit.data).toMatchObject({
      tenantId: 't-1',
      action: 'invitation.accepted',
      actorUserId: 'u-new',
    });
  });
});
