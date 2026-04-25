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
 *
 * Wave 5b extension: also wipe Acme's menu/catalog rows so menu-builder and
 * overrides specs always start clean. The seed script never touches catalog
 * tables, so this is safe — every catalog row was created by a prior test
 * run or fixture call.
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

    // Catalog + menu rows. Cascade deletes from `menus` -> sections -> items
    // and from `menu_items` -> location_items / modifier_groups, so we only
    // need to delete the tenant-scoped roots here.
    await prisma.locationItem.deleteMany({
      where: { menuItem: { tenantId: acme.id } },
    });
    await prisma.locationModifier.deleteMany({
      where: { modifier: { modifierGroup: { tenantId: acme.id } } },
    });
    await prisma.menu.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    // Cascade from MenuItem -> sectionItems / locationOverrides /
    // MenuItemModifierGroup is on, so deleting items is enough.
    await prisma.menuItem.deleteMany({ where: { tenantId: acme.id } });
    await prisma.modifierGroup.deleteMany({ where: { tenantId: acme.id } });
    await prisma.category.deleteMany({ where: { tenantId: acme.id } });
    await prisma.taxRate.deleteMany({
      where: { taxCategory: { tenantId: acme.id } },
    });
    await prisma.taxCategory.deleteMany({ where: { tenantId: acme.id } });
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

export interface CreateCatalogFixturesOptions {
  /** Tenant slug to scope fixtures to. Defaults to the seeded `acme` tenant. */
  tenantSlug?: string;
}

/**
 * Bootstrap the minimum catalog rows that menu-builder and override specs
 * need: a Food tax category, a Drinks category, and a Latte item priced at
 * $4.50. Idempotent (re-uses upsert + findFirst) so it's safe to call from
 * `beforeEach`.
 */
export async function createCatalogFixtures(opts: CreateCatalogFixturesOptions = {}) {
  const tenantSlug = opts.tenantSlug ?? 'acme';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant not found: ${tenantSlug}`);

  const tax = await prisma.taxCategory.upsert({
    where: { tenantId_kind: { tenantId: tenant.id, kind: 'FOOD' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Food', kind: 'FOOD' },
  });

  const category = await prisma.category.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'drinks' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Drinks', slug: 'drinks' },
  });

  const existingLatte = await prisma.menuItem.findFirst({
    where: { tenantId: tenant.id, name: 'Latte' },
  });
  const latte =
    existingLatte ??
    (await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        taxCategoryId: tax.id,
        categoryId: category.id,
        name: 'Latte',
        basePriceCents: 450,
        dietaryTags: ['VEGETARIAN'],
      },
    }));

  return { tenant, tax, category, latte };
}
