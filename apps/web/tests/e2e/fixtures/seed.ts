import { prisma } from '@repo/db';
import { randomBytes, scryptSync } from 'node:crypto';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/**
 * Reset everything except the canonical demo Acme tenant + owner@acme.test,
 * which the seed script created. We sweep secondary artifacts so each E2E
 * run starts from a known baseline.
 */
export async function resetTestData(): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: { NOT: { tenant: { slug: 'acme' } } },
  });
  await prisma.invitation.deleteMany({
    where: { NOT: { tenant: { slug: 'acme' } } },
  });
  await prisma.membership.deleteMany({
    where: { NOT: { tenant: { slug: 'acme' } } },
  });
  await prisma.location.deleteMany({
    where: { NOT: { tenant: { slug: 'acme' } } },
  });
  await prisma.tenant.deleteMany({ where: { NOT: { slug: 'acme' } } });
  await prisma.user.deleteMany({ where: { email: { not: 'owner@acme.test' } } });

  // Also clear acme invitations and any extra non-default Acme members so
  // each E2E run is reproducible.
  const acme = await prisma.tenant.findUnique({ where: { slug: 'acme' } });
  if (acme) {
    await prisma.invitation.deleteMany({ where: { tenantId: acme.id } });
    await prisma.auditLog.deleteMany({
      where: { tenantId: acme.id, NOT: { actorUserId: null } },
    });
    await prisma.membership.deleteMany({
      where: {
        tenantId: acme.id,
        user: { email: { not: 'owner@acme.test' } },
      },
    });
  }
}

export interface CreateTenantOptions {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerPassword: string;
}

export async function createTenantWithOwner(opts: CreateTenantOptions) {
  const tenant = await prisma.tenant.create({
    data: {
      slug: opts.slug,
      name: opts.name,
      locations: {
        create: {
          name: `${opts.name} Main`,
          slug: 'main',
          timezone: 'America/Los_Angeles',
          currency: 'USD',
        },
      },
    },
    include: { locations: true },
  });
  const user = await prisma.user.create({
    data: {
      email: opts.ownerEmail,
      passwordHash: hashPassword(opts.ownerPassword),
      emailVerified: new Date(),
      name: `${opts.name} Owner`,
    },
  });
  await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' },
  });
  return { tenant, user };
}
