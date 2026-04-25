import type { PrismaClient } from '@repo/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the nodemailer client; the catalog/menu integration suite never sends
// email but loading the schema transitively imports the email client.
vi.mock('../../email/client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  setMailer: vi.fn(),
  getMailer: vi.fn(),
}));

import { resolveUpdateMenuItem } from '../../schema/mutations/catalog/update-menu-item.js';
import { resolveSetTaxRate } from '../../schema/mutations/catalog/set-tax-rate.js';
import { resolveAttachModifierGroup } from '../../schema/mutations/catalog/attach-modifier-group.js';
import { resolveDetachModifierGroup } from '../../schema/mutations/catalog/attach-modifier-group.js';
import { resolveCreateMenu } from '../../schema/mutations/menu/create-menu.js';
import { resolveCreateMenuSection } from '../../schema/mutations/menu/create-menu-section.js';
import { resolveAddItemToMenuSection } from '../../schema/mutations/menu/add-item-to-menu-section.js';
import { resolveUpdateMenuSectionItem } from '../../schema/mutations/menu/update-menu-section-item.js';
import { resolveUpsertLocationItem } from '../../schema/mutations/location-overrides/upsert-location-item.js';
import { resolveSetItem86 } from '../../schema/mutations/location-overrides/set-item-86.js';
import { resolveCatalogItems } from '../../schema/menu-item.js';
import { resolveLocationActiveMenusQuery } from '../../schema/menu.js';
import { resolveItemPrice } from '../../menu/pricing.js';
import { makeContext, seedTenant, type SeededTenant } from '../helpers.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

interface CatalogFixtures {
  tax: { id: string };
  cat: { id: string };
  sizeGroup: { id: string };
  toppingsGroup: { id: string };
  coffee: { id: string };
  latte: { id: string };
  croissant: { id: string };
}

async function seedCatalogFixtures(
  p: PrismaClient,
  opts: { tenantId: string; locationId: string },
): Promise<CatalogFixtures> {
  const tax = await p.taxCategory.create({
    data: { tenantId: opts.tenantId, name: 'Food', kind: 'FOOD' },
  });
  await p.taxRate.create({
    data: {
      taxCategoryId: tax.id,
      locationId: opts.locationId,
      ratePermille: 825,
    },
  });
  const cat = await p.category.create({
    data: { tenantId: opts.tenantId, name: 'Drinks', slug: 'drinks' },
  });
  const sizeGroup = await p.modifierGroup.create({
    data: {
      tenantId: opts.tenantId,
      name: 'Size',
      minSelections: 1,
      maxSelections: 1,
    },
  });
  await p.modifier.createMany({
    data: [
      { modifierGroupId: sizeGroup.id, name: 'Small', priceDeltaCents: 0, sortOrder: 0 },
      { modifierGroupId: sizeGroup.id, name: 'Medium', priceDeltaCents: 75, sortOrder: 1 },
      { modifierGroupId: sizeGroup.id, name: 'Large', priceDeltaCents: 150, sortOrder: 2 },
    ],
  });
  const toppingsGroup = await p.modifierGroup.create({
    data: {
      tenantId: opts.tenantId,
      name: 'Toppings',
      minSelections: 0,
      maxSelections: 3,
    },
  });
  const coffee = await p.menuItem.create({
    data: {
      tenantId: opts.tenantId,
      taxCategoryId: tax.id,
      categoryId: cat.id,
      name: 'Coffee',
      basePriceCents: 350,
    },
  });
  const latte = await p.menuItem.create({
    data: {
      tenantId: opts.tenantId,
      taxCategoryId: tax.id,
      categoryId: cat.id,
      name: 'Latte',
      basePriceCents: 450,
      dietaryTags: ['VEGETARIAN'],
    },
  });
  const croissant = await p.menuItem.create({
    data: {
      tenantId: opts.tenantId,
      taxCategoryId: tax.id,
      categoryId: cat.id,
      name: 'Croissant',
      basePriceCents: 350,
      course: 'SIDE',
    },
  });
  await p.menuItemModifierGroup.create({
    data: { menuItemId: latte.id, modifierGroupId: sizeGroup.id, sortOrder: 0 },
  });
  return { tax, cat, sizeGroup, toppingsGroup, coffee, latte, croissant };
}

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
let fixtures: CatalogFixtures;

beforeEach(async () => {
  await truncateAll(prisma);
  A = await seedTenant(prisma, {
    name: 'Tenant A',
    slug: 'tenant-a',
    ownerEmail: 'ownerA@a.test',
  });
  fixtures = await seedCatalogFixtures(prisma, {
    tenantId: A.tenantId,
    locationId: A.locationId,
  });
});

const ctxFor = (
  tenant: SeededTenant,
  opts: { role?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER'; withLocation?: boolean } = {},
) =>
  makeContext({
    prisma,
    userId: tenant.ownerUserId,
    userEmail: tenant.ownerEmail,
    tenantId: tenant.tenantId,
    tenantSlug: tenant.tenantSlug,
    locationId: opts.withLocation === false ? null : tenant.locationId,
    role: opts.role ?? 'OWNER',
  });

describe('Menu & Catalog integration suite', () => {
  it('1. effective price resolution chain (base → location → section)', async () => {
    const item = await prisma.menuItem.findUniqueOrThrow({
      where: { id: fixtures.latte.id },
    });
    // Step 1: no overrides → base price
    expect(
      resolveItemPrice({
        basePriceCents: item.basePriceCents,
        locationOverride: null,
        sectionOverride: null,
      }),
    ).toBe(450);
    // Step 2: add location override 500
    await resolveUpsertLocationItem(
      {},
      { menuItemId: fixtures.latte.id, priceCents: 500 },
      ctxFor(A, { role: 'MANAGER' }),
      new Set(['menuItemId', 'priceCents']),
    );
    const locOverride = await prisma.locationItem.findFirstOrThrow({
      where: { menuItemId: fixtures.latte.id, locationId: A.locationId },
    });
    expect(
      resolveItemPrice({
        basePriceCents: item.basePriceCents,
        locationOverride: { priceCents: locOverride.priceCents },
        sectionOverride: null,
      }),
    ).toBe(500);
    // Step 3: add section override 400 — beats location override
    expect(
      resolveItemPrice({
        basePriceCents: item.basePriceCents,
        locationOverride: { priceCents: locOverride.priceCents },
        sectionOverride: { priceOverrideCents: 400 },
      }),
    ).toBe(400);
    // Step 4: remove section override → falls back to location override
    expect(
      resolveItemPrice({
        basePriceCents: item.basePriceCents,
        locationOverride: { priceCents: locOverride.priceCents },
        sectionOverride: { priceOverrideCents: null },
      }),
    ).toBe(500);
  });

  it('2. 86 toggle round-trip flips availability', async () => {
    const staffCtx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      locationId: A.locationId,
      role: 'STAFF',
    });
    await resolveSetItem86(
      {},
      { menuItemId: fixtures.latte.id, available: false },
      staffCtx,
    );
    const off = await prisma.locationItem.findUniqueOrThrow({
      where: {
        locationId_menuItemId: {
          locationId: A.locationId,
          menuItemId: fixtures.latte.id,
        },
      },
    });
    expect(off.available).toBe(false);
    await resolveSetItem86(
      {},
      { menuItemId: fixtures.latte.id, available: true },
      staffCtx,
    );
    const on = await prisma.locationItem.findUniqueOrThrow({
      where: {
        locationId_menuItemId: {
          locationId: A.locationId,
          menuItemId: fixtures.latte.id,
        },
      },
    });
    expect(on.available).toBe(true);
  });

  it('3. cross-tenant isolation: catalogItems and updateMenuItem', async () => {
    const B = await seedTenant(prisma, {
      name: 'Tenant B',
      slug: 'tenant-b',
      ownerEmail: 'ownerB@b.test',
    });
    const bFix = await seedCatalogFixtures(prisma, {
      tenantId: B.tenantId,
      locationId: B.locationId,
    });
    // Tenant A admin sees only A's items.
    const aItems = (await resolveCatalogItems({}, ctxFor(A, { role: 'ADMIN' }), null)) as Array<{
      id: string;
      tenantId: string;
    }>;
    expect(aItems.length).toBeGreaterThan(0);
    for (const i of aItems) expect(i.tenantId).toBe(A.tenantId);
    expect(aItems.some((i) => i.id === bFix.coffee.id)).toBe(false);
    // Tenant B context returns only B's items.
    const ctxB = makeContext({
      prisma,
      userId: B.ownerUserId,
      userEmail: B.ownerEmail,
      tenantId: B.tenantId,
      tenantSlug: B.tenantSlug,
      locationId: B.locationId,
      role: 'ADMIN',
    });
    const bItems = (await resolveCatalogItems({}, ctxB, null)) as Array<{ id: string; tenantId: string }>;
    for (const i of bItems) expect(i.tenantId).toBe(B.tenantId);
    // Tenant A admin cannot mutate a tenant B item.
    await expect(
      resolveUpdateMenuItem(
        {},
        { id: bFix.coffee.id, name: 'Hacked' },
        ctxFor(A, { role: 'ADMIN' }),
      ),
    ).rejects.toThrow(/not found/i);
    const stillB = await prisma.menuItem.findUniqueOrThrow({ where: { id: bFix.coffee.id } });
    expect(stillB.name).toBe('Coffee');
  });

  it('4. cross-location bleed-through: overrides and menus stay scoped', async () => {
    // Add a second location to tenant A.
    const locB = await prisma.location.create({
      data: {
        tenantId: A.tenantId,
        name: 'Tenant A Outpost',
        slug: 'outpost',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
      },
    });
    // The owner is tenant-wide so we can construct contexts at either location.
    const ctxAtMain = ctxFor(A, { role: 'MANAGER' });
    const ctxAtOutpost = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      locationId: locB.id,
      role: 'MANAGER',
    });
    // Create a menu at main, then ensure outpost manager cannot update it.
    const menuMain = (await resolveCreateMenu(
      {},
      { name: 'Main Menu' },
      ctxAtMain,
    )) as { id: string };
    // Outpost-scoped fetch should not see it.
    const outpostMenus = await prisma.menu.findMany({ where: { locationId: locB.id } });
    expect(outpostMenus.find((m) => m.id === menuMain.id)).toBeUndefined();
    // Outpost manager attempting to update main's menu fails.
    const { resolveUpdateMenu } = await import('../../schema/mutations/menu/update-menu.js');
    await expect(
      resolveUpdateMenu({}, { id: menuMain.id, name: 'Stolen' }, ctxAtOutpost),
    ).rejects.toThrow(/not found/i);
    // LocationItem at main does not affect price queried in outpost context.
    await resolveUpsertLocationItem(
      {},
      { menuItemId: fixtures.latte.id, priceCents: 999 },
      ctxAtMain,
      new Set(['menuItemId', 'priceCents']),
    );
    const overrideAtMain = await prisma.locationItem.findUniqueOrThrow({
      where: {
        locationId_menuItemId: {
          locationId: A.locationId,
          menuItemId: fixtures.latte.id,
        },
      },
    });
    expect(overrideAtMain.priceCents).toBe(999);
    const overrideAtOutpost = await prisma.locationItem.findUnique({
      where: {
        locationId_menuItemId: {
          locationId: locB.id,
          menuItemId: fixtures.latte.id,
        },
      },
    });
    expect(overrideAtOutpost).toBeNull();
  });

  it('5. tax rate time-bounding closes prior open rate', async () => {
    // Initial fixture set rate at 825 already. Set 800 first to seed history.
    await prisma.taxRate.deleteMany({}); // start clean
    const t0 = new Date('2026-04-25T10:00:00Z');
    const t1 = new Date('2026-04-25T11:00:00Z');
    await resolveSetTaxRate(
      {},
      {
        taxCategoryId: fixtures.tax.id,
        locationId: A.locationId,
        ratePermille: 800,
        effectiveFrom: t0,
      },
      ctxFor(A, { role: 'ADMIN' }),
    );
    await resolveSetTaxRate(
      {},
      {
        taxCategoryId: fixtures.tax.id,
        locationId: A.locationId,
        ratePermille: 825,
        effectiveFrom: t1,
      },
      ctxFor(A, { role: 'ADMIN' }),
    );
    const rates = await prisma.taxRate.findMany({
      where: {
        taxCategoryId: fixtures.tax.id,
        locationId: A.locationId,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    expect(rates).toHaveLength(2);
    expect(rates[0]!.ratePermille).toBe(825);
    expect(rates[0]!.effectiveUntil).toBeNull();
    expect(rates[1]!.ratePermille).toBe(800);
    expect(rates[1]!.effectiveUntil?.toISOString()).toBe(t1.toISOString());
  });

  it('6. audit log entries: catalog mutations write spec audit codes', async () => {
    // Each catalog/menu/location mutation we exercise in this file should
    // produce exactly one audit row. Drive a representative set here.
    const adminCtx = ctxFor(A, { role: 'ADMIN' });
    const managerCtx = ctxFor(A, { role: 'MANAGER' });
    const staffCtx = makeContext({
      prisma,
      userId: A.ownerUserId,
      userEmail: A.ownerEmail,
      tenantId: A.tenantId,
      tenantSlug: A.tenantSlug,
      locationId: A.locationId,
      role: 'STAFF',
    });

    await resolveUpdateMenuItem(
      {},
      { id: fixtures.coffee.id, name: 'Drip Coffee' },
      adminCtx,
    );
    await resolveSetTaxRate(
      {},
      {
        taxCategoryId: fixtures.tax.id,
        locationId: A.locationId,
        ratePermille: 850,
      },
      adminCtx,
    );
    await resolveAttachModifierGroup(
      { menuItemId: fixtures.coffee.id, modifierGroupId: fixtures.toppingsGroup.id },
      adminCtx,
    );
    await resolveDetachModifierGroup(
      { menuItemId: fixtures.coffee.id, modifierGroupId: fixtures.toppingsGroup.id },
      adminCtx,
    );
    const menu = (await resolveCreateMenu({}, { name: 'All Day' }, managerCtx)) as { id: string };
    const section = (await resolveCreateMenuSection(
      {},
      { menuId: menu.id, name: 'Drinks' },
      managerCtx,
    )) as { id: string };
    const sectionItem = (await resolveAddItemToMenuSection(
      {},
      { menuSectionId: section.id, menuItemId: fixtures.coffee.id },
      managerCtx,
    )) as { id: string };
    await resolveUpdateMenuSectionItem(
      {},
      { id: sectionItem.id, priceOverrideCents: 300 },
      managerCtx,
      new Set(['id', 'priceOverrideCents']),
    );
    await resolveUpsertLocationItem(
      {},
      { menuItemId: fixtures.coffee.id, priceCents: 400 },
      managerCtx,
      new Set(['menuItemId', 'priceCents']),
    );
    await resolveSetItem86(
      {},
      { menuItemId: fixtures.coffee.id, available: false },
      staffCtx,
    );

    const audits = await prisma.auditLog.findMany({
      where: { tenantId: A.tenantId },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    const actions = audits.map((a) => a.action);
    // Each spec'd action code is present at least once.
    for (const expected of [
      'catalog.item.updated',
      'catalog.tax_rate.set',
      'catalog.item.modifier_group.attached',
      'catalog.item.modifier_group.detached',
      'menu.created',
      'menu.section.created',
      'menu.section.item_added',
      'menu.section.item_updated',
      'location.item.override_set',
      'location.item.86_toggled',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  it('7. schedule liveness: only Always + weekend brunch are live on Sat 10am PDT', async () => {
    const managerCtx = ctxFor(A, { role: 'MANAGER' });
    const always = (await resolveCreateMenu(
      {},
      { name: 'Always', schedule: { kind: 'always' } },
      managerCtx,
    )) as { id: string };
    const weekday = (await resolveCreateMenu(
      {},
      {
        name: 'Weekday Breakfast',
        schedule: {
          kind: 'weekly',
          windows: [
            {
              days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
              start: '06:00',
              end: '11:00',
            },
          ],
        },
      },
      managerCtx,
    )) as { id: string };
    const weekend = (await resolveCreateMenu(
      {},
      {
        name: 'Weekend Brunch',
        schedule: {
          kind: 'weekly',
          windows: [{ days: ['SAT', 'SUN'], start: '08:00', end: '14:00' }],
        },
      },
      managerCtx,
    )) as { id: string };
    const at = new Date('2026-04-25T17:00:00Z'); // Saturday 10am PDT
    const live = (await resolveLocationActiveMenusQuery({}, managerCtx, at)) as Array<{
      id: string;
    }>;
    const ids = live.map((m) => m.id);
    expect(ids).toContain(always.id);
    expect(ids).toContain(weekend.id);
    expect(ids).not.toContain(weekday.id);
  });

  it('8. modifier group attach / detach / re-attach with sortOrder', async () => {
    const adminCtx = ctxFor(A, { role: 'ADMIN' });
    // Attach Size to Coffee.
    await resolveAttachModifierGroup(
      { menuItemId: fixtures.coffee.id, modifierGroupId: fixtures.sizeGroup.id },
      adminCtx,
    );
    let attachments = await prisma.menuItemModifierGroup.findMany({
      where: { menuItemId: fixtures.coffee.id },
    });
    expect(attachments.map((a) => a.modifierGroupId)).toContain(fixtures.sizeGroup.id);
    // Detach.
    await resolveDetachModifierGroup(
      { menuItemId: fixtures.coffee.id, modifierGroupId: fixtures.sizeGroup.id },
      adminCtx,
    );
    attachments = await prisma.menuItemModifierGroup.findMany({
      where: { menuItemId: fixtures.coffee.id },
    });
    expect(attachments).toHaveLength(0);
    // Re-attach with explicit sortOrder=5.
    await resolveAttachModifierGroup(
      {
        menuItemId: fixtures.coffee.id,
        modifierGroupId: fixtures.sizeGroup.id,
        sortOrder: 5,
      },
      adminCtx,
    );
    const reattached = await prisma.menuItemModifierGroup.findFirstOrThrow({
      where: {
        menuItemId: fixtures.coffee.id,
        modifierGroupId: fixtures.sizeGroup.id,
      },
    });
    expect(reattached.sortOrder).toBe(5);
  });
});
