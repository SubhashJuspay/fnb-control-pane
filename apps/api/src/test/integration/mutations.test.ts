import type { PrismaClient } from '@repo/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}));

vi.mock('../../email/client.js', () => ({
  sendEmail: sendEmailMock,
  setMailer: vi.fn(),
  getMailer: vi.fn(),
}));

import { resolveAcceptInvitation } from '../../schema/mutations/accept-invitation.js';
import { resolveCreateLocation } from '../../schema/mutations/create-location.js';
import { resolveInviteStaff } from '../../schema/mutations/invite-staff.js';
import { resolveRevokeMembership } from '../../schema/mutations/revoke-membership.js';
import { resolveUpdateMembershipRole } from '../../schema/mutations/update-membership-role.js';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { generateInvitationToken } from '../../tokens.js';
import { makeContext, seedTenant, type SeededTenant } from '../helpers.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

let db: TestDb;
let prisma: PrismaClient;
let A: SeededTenant;

beforeAll(async () => {
  db = await setupTestDb();
  prisma = db.prisma;
}, 240_000);

afterAll(async () => {
  await db?.cleanup();
});

beforeEach(async () => {
  await truncateAll(prisma);
  A = await seedTenant(prisma, {
    name: 'Tenant A',
    slug: 'tenant-a',
    ownerEmail: 'owner@a.test',
  });
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
});

function ownerCtx(): ReturnType<typeof makeContext> {
  return makeContext({
    prisma,
    userId: A.ownerUserId,
    userEmail: A.ownerEmail,
    tenantId: A.tenantId,
    tenantSlug: A.tenantSlug,
    role: 'OWNER',
  });
}

describe('createLocation (integration)', () => {
  it('happy path: OWNER creates a location, audit log is written', async () => {
    const created = (await resolveCreateLocation(
      {},
      { name: 'Branch 2', slug: 'branch-2', timezone: 'UTC', currency: 'USD' },
      ownerCtx(),
    )) as { id: string };
    expect(created.id).toBeTruthy();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: created.id, action: 'location.created' },
    });
    expect(audit.tenantId).toBe(A.tenantId);
    expect(audit.actorUserId).toBe(A.ownerUserId);
  });

  it('forbidden: STAFF cannot create a location', async () => {
    const ctx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'STAFF',
    });
    await expect(
      resolveCreateLocation(
        {},
        { name: 'Nope', slug: 'nope', timezone: 'UTC', currency: 'USD' },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('inviteStaff (integration)', () => {
  it('happy path: MANAGER invites STAFF, sendEmail called, audit written', async () => {
    const ctx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'MANAGER',
    });
    await resolveInviteStaff(
      {},
      { email: 'newstaff@a.test', role: 'STAFF', locationId: A.locationId },
      ctx,
    );
    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { email: 'newstaff@a.test' },
    });
    expect(invitation.tenantId).toBe(A.tenantId);
    expect(invitation.role).toBe('STAFF');
    expect(invitation.locationId).toBe(A.locationId);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const auditCount = await prisma.auditLog.count({
      where: { action: 'invitation.created', resourceId: invitation.id },
    });
    expect(auditCount).toBe(1);
  });

  it('forbidden: STAFF cannot invite', async () => {
    const ctx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'STAFF',
    });
    await expect(
      resolveInviteStaff({}, { email: 'x@a.test', role: 'STAFF', locationId: A.locationId }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('acceptInvitation (integration)', () => {
  it('happy path: anonymous user accepts invitation, user + membership created', async () => {
    // Issue an invitation with a known token.
    const { token, tokenHash } = generateInvitationToken();
    const inv = await prisma.invitation.create({
      data: {
        tenantId: A.tenantId,
        locationId: A.locationId,
        email: 'newhire@a.test',
        role: 'STAFF',
        tokenHash,
        invitedById: A.ownerUserId,
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      },
    });
    await resolveAcceptInvitation(
      {},
      { token, name: 'New Hire', password: 'password1' },
      makeContext({ prisma }),
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'newhire@a.test' },
    });
    expect(user.passwordHash).toMatch(/^scrypt:/);
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id, tenantId: A.tenantId },
    });
    expect(membership.role).toBe('STAFF');
    expect(membership.locationId).toBe(A.locationId);
    const refreshed = await prisma.invitation.findUniqueOrThrow({
      where: { id: inv.id },
    });
    expect(refreshed.acceptedAt).not.toBeNull();
  });

  it('forbidden: expired invitation is rejected', async () => {
    const { token, tokenHash } = generateInvitationToken();
    await prisma.invitation.create({
      data: {
        tenantId: A.tenantId,
        locationId: A.locationId,
        email: 'late@a.test',
        role: 'STAFF',
        tokenHash,
        invitedById: A.ownerUserId,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(
      resolveAcceptInvitation(
        {},
        { token, name: 'Late', password: 'password1' },
        makeContext({ prisma }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('revokeMembership (integration)', () => {
  it('happy path: OWNER revokes a STAFF membership, audit written', async () => {
    const staffUser = await prisma.user.create({
      data: { email: 'revokeme@a.test', name: 'X' },
    });
    const m = await prisma.membership.create({
      data: {
        userId: staffUser.id,
        tenantId: A.tenantId,
        locationId: A.locationId,
        role: 'STAFF',
      },
    });
    const updated = (await resolveRevokeMembership({}, { membershipId: m.id }, ownerCtx())) as {
      id: string;
      status: string;
    };
    expect(updated.status).toBe('REVOKED');
    const auditCount = await prisma.auditLog.count({
      where: { action: 'membership.revoked', resourceId: m.id },
    });
    expect(auditCount).toBe(1);
  });

  it('forbidden: STAFF cannot revoke', async () => {
    const ctx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'STAFF',
    });
    await expect(
      resolveRevokeMembership({}, { membershipId: A.ownerMembershipId }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to revoke the last active OWNER', async () => {
    await expect(
      resolveRevokeMembership({}, { membershipId: A.ownerMembershipId }, ownerCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('updateMembershipRole (integration)', () => {
  it('happy path: OWNER promotes STAFF to MANAGER, audit written', async () => {
    const staffUser = await prisma.user.create({
      data: { email: 'p@a.test', name: 'P' },
    });
    const m = await prisma.membership.create({
      data: {
        userId: staffUser.id,
        tenantId: A.tenantId,
        locationId: A.locationId,
        role: 'STAFF',
      },
    });
    const updated = (await resolveUpdateMembershipRole(
      {},
      { membershipId: m.id, role: 'MANAGER' },
      ownerCtx(),
    )) as { id: string; role: string };
    expect(updated.role).toBe('MANAGER');
    const auditCount = await prisma.auditLog.count({
      where: { action: 'membership.role_updated', resourceId: m.id },
    });
    expect(auditCount).toBe(1);
  });

  it('forbidden: STAFF cannot update roles', async () => {
    const ctx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'STAFF',
    });
    await expect(
      resolveUpdateMembershipRole({}, { membershipId: A.ownerMembershipId, role: 'ADMIN' }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
