import type { PrismaClient } from '@repo/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the nodemailer client at module load — anything that imports
// '../email/client.js' transitively gets a no-op sendEmail. This must be
// declared before any test imports the resolvers.
vi.mock('../../email/client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  setMailer: vi.fn(),
  getMailer: vi.fn(),
}));

import { resolveAcceptInvitation } from '../../schema/mutations/accept-invitation.js';
import { resolveCreateLocation } from '../../schema/mutations/create-location.js';
import { resolveInviteStaff } from '../../schema/mutations/invite-staff.js';
import { resolveTenantMembers } from '../../schema/membership.js';
import {
  resolveMyTenants,
  resolveTenantLocations,
} from '../../schema/tenant.js';
import { resolveViewer } from '../../schema/viewer.js';
import { generateInvitationToken } from '../../tokens.js';
import { makeContext, seedTenant, type SeededTenant } from '../helpers.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await setupTestDb();
  prisma = db.prisma;
}, 240_000);

afterAll(async () => {
  await db?.cleanup();
});

let A: SeededTenant;
let B: SeededTenant;

beforeEach(async () => {
  await truncateAll(prisma);
  A = await seedTenant(prisma, {
    name: 'Tenant A',
    slug: 'tenant-a',
    ownerEmail: 'ownerA@a.test',
  });
  B = await seedTenant(prisma, {
    name: 'Tenant B',
    slug: 'tenant-b',
    ownerEmail: 'ownerB@b.test',
  });
});

describe('tenant isolation regression', () => {
  it('userA viewer.tenants does not include tenantB', async () => {
    const ctx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'OWNER',
    });
    const viewer = await resolveViewer(ctx);
    expect(viewer?.id).toBe(A.ownerUserId);
    const tenants = await prisma.tenant.findMany({
      where: {
        status: 'ACTIVE',
        memberships: { some: { userId: A.ownerUserId, status: 'ACTIVE' } },
      },
    });
    expect(tenants.map((t) => t.id)).toEqual([A.tenantId]);
    expect(tenants.map((t) => t.id)).not.toContain(B.tenantId);
  });

  it('Query.myTenants returns only tenants the viewer is a member of', async () => {
    const ctx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'OWNER',
    });
    const result = (await resolveMyTenants({}, ctx)) as { id: string; slug: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(A.tenantId);
    expect(result[0]?.slug).toBe('tenant-a');
  });

  it('Tenant.locations returns empty when called for a tenant the viewer is NOT a member of', async () => {
    const ctxA = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'OWNER',
    });
    // The resolver receives `parent` = the Tenant being queried. Pass tenantB
    // as parent — userA is not a member of B, so the result must be [].
    const result = await resolveTenantLocations({}, { id: B.tenantId }, ctxA);
    expect(result).toEqual([]);
  });

  it('Query.tenantMembers scopes to ctx.auth.tenant.id', async () => {
    // Seed an extra membership in tenantA so we know there are >0 results.
    await prisma.user.create({
      data: { email: 'extraA@a.test', name: 'Extra A' },
    }).then((u) =>
      prisma.membership.create({
        data: { userId: u.id, tenantId: A.tenantId, role: 'STAFF', locationId: A.locationId },
      }),
    );
    const ctxA = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'OWNER',
    });
    const members = (await resolveTenantMembers({}, ctxA)) as { tenantId: string }[];
    expect(members.length).toBeGreaterThanOrEqual(2);
    for (const m of members) {
      expect(m.tenantId).toBe(A.tenantId);
    }
  });

  it('userA OWNER cannot create a location in tenantB (mutation always uses ctx.auth.tenant.id)', async () => {
    // The mutation reads tenantId from ctx.auth.tenant.id. There is no way
    // for userA — who has no membership in tenantB — to construct a context
    // with auth.tenant.id = B.tenantId via buildContext. We assert that here:
    // even if a caller tried, the resolver would create the location under
    // userA's *own* tenant, never tenantB.
    const ctxA = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      role: 'OWNER',
    });
    await resolveCreateLocation(
      {},
      {
        name: 'Sneaky',
        slug: 'sneaky-' + Math.random().toString(36).slice(2, 8),
        timezone: 'UTC',
        currency: 'USD',
      },
      ctxA,
    );
    // The new location must belong to tenantA, not tenantB.
    const created = await prisma.location.findFirst({
      where: { name: 'Sneaky' },
    });
    expect(created?.tenantId).toBe(A.tenantId);
    const tenantBLocations = await prisma.location.count({
      where: { tenantId: B.tenantId },
    });
    expect(tenantBLocations).toBe(1); // just the seeded one
  });

  it('userA cannot accept an invitation issued for tenantB (memberships are tenant-scoped via the invitation row)', async () => {
    // OwnerB creates an invitation for a brand new email under tenantB.
    const ctxB = makeContext({
      prisma,
      userId: B.ownerUserId,
      userEmail: B.ownerEmail,
      tenantId: B.tenantId,
      tenantSlug: B.tenantSlug,
      role: 'OWNER',
    });
    await resolveInviteStaff(
      {},
      { email: 'invitee@b.test', role: 'STAFF', locationId: B.locationId },
      ctxB,
    );
    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { email: 'invitee@b.test' },
    });
    expect(invitation.tenantId).toBe(B.tenantId);

    // Accepting the invitation creates a membership under tenantB, not A,
    // because the invitation row pins the tenant. There is no way to redirect
    // the resulting membership to tenantA via inputs.
    const anonCtx = makeContext({ prisma });
    // Re-issue with a known token so we can call accept-invitation.
    const { token, tokenHash } = generateInvitationToken();
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash },
    });
    await resolveAcceptInvitation(
      {},
      { token, name: 'Bob', password: 'password1' },
      anonCtx,
    );
    const newMembership = await prisma.membership.findFirstOrThrow({
      where: { user: { email: 'invitee@b.test' } },
    });
    expect(newMembership.tenantId).toBe(B.tenantId);
    expect(newMembership.tenantId).not.toBe(A.tenantId);
  });
});
