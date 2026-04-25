import { randomBytes, scryptSync } from 'node:crypto';
import { prisma } from './index.js';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  console.warn('Seeding demo tenant...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Restaurant Group',
      slug: 'acme',
    },
  });

  const location = await prisma.location.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'mission-st' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Acme — Mission St',
      slug: 'mission-st',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      locale: 'en-US',
    },
  });

  const ownerEmail = 'owner@acme.test';
  const ownerPassword = 'Password123!';

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      email: ownerEmail,
      name: 'Acme Owner',
      passwordHash: hashPassword(ownerPassword),
      emailVerified: new Date(),
    },
  });

  // Postgres treats NULLs as distinct in unique constraints, so we cannot
  // rely on Prisma's compound-unique upsert when locationId is null. Check
  // first; only insert if no tenant-wide OWNER membership exists.
  const existingOwnerMembership = await prisma.membership.findFirst({
    where: {
      userId: owner.id,
      tenantId: tenant.id,
      locationId: null,
    },
  });

  if (!existingOwnerMembership) {
    await prisma.membership.create({
      data: {
        userId: owner.id,
        tenantId: tenant.id,
        role: 'OWNER',
      },
    });
  }

  console.warn('\n=== Demo credentials ===');
  console.warn(`Tenant slug:  ${tenant.slug}`);
  console.warn(`Location:     ${location.slug}`);
  console.warn(`Email:        ${ownerEmail}`);
  console.warn(`Password:     ${ownerPassword}`);
  console.warn('========================\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
