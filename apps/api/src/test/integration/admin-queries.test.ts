import type { PrismaClient } from '@repo/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resolveAuditLogs } from '../../schema/audit.js';
import { resolveTenantInvitations } from '../../schema/invitation.js';
import { resolveTenantLocationsAdmin } from '../../schema/location.js';
import { resolveRevokeInvitation } from '../../schema/mutations/revoke-invitation.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import { generateInvitationToken } from '../../tokens.js';
import { makeContext, seedTenant, type SeededTenant } from '../helpers.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

let db: TestDb;
let prisma: PrismaClient;
let A: SeededTenant;
let B: SeededTenant;

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
  B = await seedTenant(prisma, {
    name: 'Tenant B',
    slug: 'tenant-b',
    ownerEmail: 'owner@b.test',
  });
});

function ownerCtxA(): ReturnType<typeof makeContext> {
  return makeContext({
    prisma,
    userId: A.ownerUserId,
    userEmail: A.ownerEmail,
    tenantId: A.tenantId,
    tenantSlug: A.tenantSlug,
    role: 'OWNER',
  });
}

function staffCtxA(): ReturnType<typeof makeContext> {
  return makeContext({
    prisma,
    userId: A.ownerUserId,
    userEmail: A.ownerEmail,
    tenantId: A.tenantId,
    tenantSlug: A.tenantSlug,
    role: 'STAFF',
  });
}

describe('tenantInvitations (integration)', () => {
  it('returns only pending, unexpired invitations for the current tenant', async () => {
    const { tokenHash: hashA1 } = generateInvitationToken();
    const { tokenHash: hashA2Expired } = generateInvitationToken();
    const { tokenHash: hashA3Accepted } = generateInvitationToken();
    const { tokenHash: hashB1 } = generateInvitationToken();
    await prisma.invitation.createMany({
      data: [
        {
          tenantId: A.tenantId,
          email: 'a1@test',
          role: 'STAFF',
          locationId: A.locationId,
          tokenHash: hashA1,
          invitedById: A.ownerUserId,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        {
          tenantId: A.tenantId,
          email: 'a2@test',
          role: 'STAFF',
          locationId: A.locationId,
          tokenHash: hashA2Expired,
          invitedById: A.ownerUserId,
          expiresAt: new Date(Date.now() - 1_000),
        },
        {
          tenantId: A.tenantId,
          email: 'a3@test',
          role: 'STAFF',
          locationId: A.locationId,
          tokenHash: hashA3Accepted,
          invitedById: A.ownerUserId,
          expiresAt: new Date(Date.now() + 86_400_000),
          acceptedAt: new Date(),
        },
        {
          tenantId: B.tenantId,
          email: 'b1@test',
          role: 'STAFF',
          locationId: B.locationId,
          tokenHash: hashB1,
          invitedById: B.ownerUserId,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      ],
    });
    const result = (await resolveTenantInvitations({}, ownerCtxA())) as Array<{
      email: string;
    }>;
    expect(result.map((r) => r.email).sort()).toEqual(['a1@test']);
  });

  it('forbidden: anonymous viewer cannot list invitations', async () => {
    await expect(
      resolveTenantInvitations({}, makeContext({ prisma })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('tenantLocations admin (integration)', () => {
  it('returns all non-archived locations for the current tenant', async () => {
    await prisma.location.create({
      data: {
        tenantId: A.tenantId,
        name: 'Branch 2',
        slug: 'branch-2',
        timezone: 'UTC',
        currency: 'USD',
      },
    });
    await prisma.location.create({
      data: {
        tenantId: A.tenantId,
        name: 'Old',
        slug: 'old',
        timezone: 'UTC',
        currency: 'USD',
        status: 'ARCHIVED',
      },
    });
    await prisma.location.create({
      data: {
        tenantId: B.tenantId,
        name: 'Other Tenant Loc',
        slug: 'other',
        timezone: 'UTC',
        currency: 'USD',
      },
    });
    const result = (await resolveTenantLocationsAdmin(
      {},
      ownerCtxA(),
    )) as Array<{ name: string; tenantId: string }>;
    expect(result.map((r) => r.name).sort()).toEqual(['Branch 2', 'Tenant A Main']);
    for (const loc of result) {
      expect(loc.tenantId).toBe(A.tenantId);
    }
  });

  it('forbidden: anonymous cannot list locations', async () => {
    await expect(
      resolveTenantLocationsAdmin({}, makeContext({ prisma })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('auditLogs (integration)', () => {
  it('returns audit entries scoped to the current tenant', async () => {
    await prisma.auditLog.create({
      data: {
        tenantId: A.tenantId,
        actorUserId: A.ownerUserId,
        action: 'a.first',
        resourceType: 'r',
      },
    });
    // Force a separate timestamp to make DESC ordering deterministic.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.auditLog.create({
      data: {
        tenantId: A.tenantId,
        actorUserId: A.ownerUserId,
        action: 'a.second',
        resourceType: 'r',
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: B.tenantId,
        actorUserId: B.ownerUserId,
        action: 'b.first',
        resourceType: 'r',
      },
    });
    const result = (await resolveAuditLogs({}, ownerCtxA())) as Array<{
      action: string;
      tenantId: string;
    }>;
    // Tenant scoping: only A's two entries.
    expect(result.map((r) => r.action).sort()).toEqual([
      'a.first',
      'a.second',
    ]);
    for (const row of result) expect(row.tenantId).toBe(A.tenantId);
    // DESC order check (newest first).
    expect(result[0]?.action).toBe('a.second');
  });

  it('forbidden: anonymous cannot read audit logs', async () => {
    await expect(
      resolveAuditLogs({}, makeContext({ prisma })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('revokeInvitation (integration)', () => {
  it('happy path: OWNER deletes a pending invitation, audit written', async () => {
    const { tokenHash } = generateInvitationToken();
    const inv = await prisma.invitation.create({
      data: {
        tenantId: A.tenantId,
        locationId: A.locationId,
        email: 'gone@a.test',
        role: 'STAFF',
        tokenHash,
        invitedById: A.ownerUserId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const result = await resolveRevokeInvitation(
      { invitationId: inv.id },
      ownerCtxA(),
    );
    expect(result.id).toBe(inv.id);
    const remaining = await prisma.invitation.findUnique({ where: { id: inv.id } });
    expect(remaining).toBeNull();
    const auditCount = await prisma.auditLog.count({
      where: { action: 'invitation.revoked', resourceId: inv.id },
    });
    expect(auditCount).toBe(1);
  });

  it('forbidden: STAFF cannot revoke', async () => {
    const { tokenHash } = generateInvitationToken();
    const inv = await prisma.invitation.create({
      data: {
        tenantId: A.tenantId,
        locationId: A.locationId,
        email: 'staffcantrevoke@a.test',
        role: 'STAFF',
        tokenHash,
        invitedById: A.ownerUserId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await expect(
      resolveRevokeInvitation({ invitationId: inv.id }, staffCtxA()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to revoke already-accepted invitation', async () => {
    const { tokenHash } = generateInvitationToken();
    const inv = await prisma.invitation.create({
      data: {
        tenantId: A.tenantId,
        locationId: A.locationId,
        email: 'accepted@a.test',
        role: 'STAFF',
        tokenHash,
        invitedById: A.ownerUserId,
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedAt: new Date(),
      },
    });
    await expect(
      resolveRevokeInvitation({ invitationId: inv.id }, ownerCtxA()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('cross-tenant: cannot revoke a different tenant invitation', async () => {
    const { tokenHash } = generateInvitationToken();
    const inv = await prisma.invitation.create({
      data: {
        tenantId: B.tenantId,
        locationId: B.locationId,
        email: 'b@test',
        role: 'STAFF',
        tokenHash,
        invitedById: B.ownerUserId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await expect(
      resolveRevokeInvitation({ invitationId: inv.id }, ownerCtxA()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
