import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockUserFindUnique,
  mockMembershipFindFirst,
  mockTenantFindUniqueOrThrow,
  mockLocationFindUnique,
  mockInvitationCreate,
  mockAuditCreate,
  mockSendEmail,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
  mockTenantFindUniqueOrThrow: vi.fn(),
  mockLocationFindUnique: vi.fn(),
  mockInvitationCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    membership: { findFirst: mockMembershipFindFirst },
    tenant: { findUniqueOrThrow: mockTenantFindUniqueOrThrow },
    location: { findUnique: mockLocationFindUnique },
    invitation: { create: mockInvitationCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../email/client.js', () => ({
  sendEmail: mockSendEmail,
}));

import type { AuthContext, RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { resolveInviteStaff } from './invite-staff.js';

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
      user: { findUnique: mockUserFindUnique },
      membership: { findFirst: mockMembershipFindFirst },
      tenant: { findUniqueOrThrow: mockTenantFindUniqueOrThrow },
      location: { findUnique: mockLocationFindUnique },
      invitation: { create: mockInvitationCreate },
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
  mockUserFindUnique.mockReset();
  mockMembershipFindFirst.mockReset();
  mockTenantFindUniqueOrThrow.mockReset();
  mockLocationFindUnique.mockReset();
  mockInvitationCreate.mockReset();
  mockAuditCreate.mockReset();
  mockSendEmail.mockReset();
});

describe('resolveInviteStaff', () => {
  it('throws ForbiddenError for anonymous viewers', async () => {
    await expect(
      resolveInviteStaff(
        {},
        { email: 'a@b.com', role: 'STAFF', locationId: 'loc-1' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for STAFF role', async () => {
    await expect(
      resolveInviteStaff(
        {},
        { email: 'a@b.com', role: 'STAFF', locationId: 'loc-1' },
        ctxFor({
          ...ownerAuth,
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ConflictError when invitee already has an active membership', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'u-existing' });
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'm-existing' });
    await expect(
      resolveInviteStaff(
        {},
        { email: 'a@b.com', role: 'ADMIN', locationId: null },
        ctxFor(ownerAuth),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates invitation, sends email, writes audit on happy path', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockTenantFindUniqueOrThrow.mockResolvedValueOnce({ name: 'Acme' });
    mockLocationFindUnique.mockResolvedValueOnce({ name: 'Main' });
    mockInvitationCreate.mockResolvedValueOnce({ id: 'inv-1' });
    mockAuditCreate.mockResolvedValueOnce({ id: 'a-1' });
    mockSendEmail.mockResolvedValueOnce(undefined);

    const result = await resolveInviteStaff(
      {},
      { email: 'new@b.com', role: 'STAFF', locationId: 'loc-1' },
      ctxFor(ownerAuth),
    );
    expect(result).toEqual({ id: 'inv-1' });
    expect(mockInvitationCreate).toHaveBeenCalledTimes(1);
    const inviteCall = mockInvitationCreate.mock.calls[0]?.[0];
    expect(inviteCall.data).toMatchObject({
      tenantId: 't-1',
      locationId: 'loc-1',
      email: 'new@b.com',
      role: 'STAFF',
      invitedById: 'u-owner',
    });
    expect(inviteCall.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(inviteCall.data.expiresAt).toBeInstanceOf(Date);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = mockSendEmail.mock.calls[0] as [string, string, string];
    expect(to).toBe('new@b.com');
    expect(subject).toContain('Acme');
    expect(html).toContain('STAFF');
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });
});
