/**
 * Comprehensive demo seed for the F&B Control Pane.
 *
 * Wipes and re-creates two demo tenants ("acme" and "bistro-marais") with
 * users covering every role, a full catalog, menus, floor plan, reservations,
 * staff/scheduling rows, ~30 closed POS tickets for analytics, guests, and
 * online-order activity. The dev seed (`seed.ts`) is independent — running
 * this seed leaves the canonical `owner@acme.test` user intact while
 * recreating the rest of the demo data idempotently.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { Prisma, prisma } from './index.js';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

const DEMO_PASSWORD = 'Password123!';
const DEMO_TENANT_SLUGS = ['acme', 'bistro-marais'] as const;

// ─────────────────────────────────────────────
// Pricing helpers (mirror apps/api/src/order/pricing.ts)
// ─────────────────────────────────────────────
function computeLineSubtotalCents(args: {
  unitPriceCents: number;
  quantity: number;
  modifiers: Array<{ priceDeltaCents: number }>;
}): { modifiersTotalCents: number; lineSubtotalCents: number } {
  const modifiersTotalCents = args.modifiers.reduce((acc, m) => acc + m.priceDeltaCents, 0);
  const lineSubtotalCents = (args.unitPriceCents + modifiersTotalCents) * args.quantity;
  return { modifiersTotalCents, lineSubtotalCents };
}

function computeTicketTotalsCents(args: {
  items: Array<{ lineSubtotalCents: number; lineDiscountCents: number; status: string }>;
  ticketDiscountCents: number;
  taxRatePermille: number;
}): { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number } {
  const liveItems = args.items.filter((i) => i.status !== 'VOIDED');
  const subtotalCents = liveItems.reduce((acc, i) => acc + i.lineSubtotalCents, 0);
  const lineDiscountTotal = liveItems.reduce((acc, i) => acc + i.lineDiscountCents, 0);
  const discountCents = lineDiscountTotal + args.ticketDiscountCents;
  const netCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round((netCents * args.taxRatePermille) / 10_000);
  const totalCents = netCents + taxCents;
  return { subtotalCents, discountCents, taxCents, totalCents };
}

// Seeded RNG so repeat runs produce roughly the same shape (still random
// looking but stable enough for snapshot eyeballing).
function mulberry32(seed: number): () => number {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260429);
function pick<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick(): empty array');
  // Non-empty array → index access is safe; cast to satisfy noUncheckedIndexedAccess.
  return arr[Math.floor(rand() * arr.length)] as T;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// ─────────────────────────────────────────────
// Wipe demo tenants
// ─────────────────────────────────────────────
async function wipeDemoTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: [...DEMO_TENANT_SLUGS] } },
    select: { id: true, slug: true, systemUserId: true },
  });
  if (tenants.length === 0) return;
  const tenantIds = tenants.map((t) => t.id);

  // Detach system users so they can be deleted with the user sweep.
  for (const t of tenants) {
    if (t.systemUserId) {
      await prisma.tenant.update({ where: { id: t.id }, data: { systemUserId: null } });
    }
  }

  // Order: leaves first, roots last. Use raw scopes via relations.
  const locFilter = { location: { tenantId: { in: tenantIds } } };

  await prisma.onlineOrderRequest.deleteMany({ where: locFilter });
  await prisma.break.deleteMany({ where: { timeEntry: locFilter } });
  await prisma.timeEntry.deleteMany({ where: locFilter });
  await prisma.shift.deleteMany({ where: locFilter });
  await prisma.discount.deleteMany({ where: locFilter });
  await prisma.ticketItemModifier.deleteMany({
    where: { ticketItem: { ticket: locFilter } },
  });
  await prisma.ticketItem.deleteMany({ where: { ticket: locFilter } });
  await prisma.reservation.deleteMany({ where: locFilter });
  await prisma.ticket.deleteMany({ where: locFilter });
  await prisma.table.deleteMany({ where: locFilter });
  await prisma.section.deleteMany({ where: locFilter });
  await prisma.employmentProfile.deleteMany({ where: locFilter });
  await prisma.menuSectionItem.deleteMany({
    where: { menuSection: { menu: locFilter } },
  });
  await prisma.menuSection.deleteMany({ where: { menu: locFilter } });
  await prisma.menu.deleteMany({ where: locFilter });
  await prisma.locationItem.deleteMany({ where: locFilter });
  await prisma.locationModifier.deleteMany({ where: locFilter });
  await prisma.taxRate.deleteMany({ where: locFilter });

  // Tenant-scoped catalog
  await prisma.menuItemModifierGroup.deleteMany({
    where: { menuItem: { tenantId: { in: tenantIds } } },
  });
  await prisma.modifier.deleteMany({
    where: { modifierGroup: { tenantId: { in: tenantIds } } },
  });
  await prisma.modifierGroup.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.menuItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.category.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.taxCategory.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.guest.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.jobRole.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.availabilityWindow.deleteMany({
    where: { user: { memberships: { some: { tenantId: { in: tenantIds } } } } },
  });
  await prisma.invitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } });

  // Delete demo users. Keep the dev-seed owner (owner@acme.test will be
  // re-attached as the canonical Acme owner if it already exists).
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'admin@acme.test',
          'manager.mission@acme.test',
          'manager.castro@acme.test',
          'server.mission@acme.test',
          'cook.mission@acme.test',
          'server.castro@acme.test',
          'viewer@acme.test',
          'owner@bistro.test',
          'serveur@bistro.test',
        ],
      },
    },
  });

  await prisma.tenant.deleteMany({ where: { slug: { in: [...DEMO_TENANT_SLUGS] } } });
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.warn('[demo-seed] wiping demo tenants…');
  await wipeDemoTenants();

  const summary = {
    tenants: 0,
    locations: 0,
    users: 0,
    categories: 0,
    items: 0,
    modifierGroups: 0,
    modifiers: 0,
    tables: 0,
    reservations: 0,
    shifts: 0,
    timeEntries: 0,
    tickets: 0,
    ticketItems: 0,
    guests: 0,
    onlineOrders: 0,
  };

  // ─── Tenants & Locations ────────────────────────────
  const acme = await prisma.tenant.create({
    data: { name: 'Acme Restaurant Group', slug: 'acme' },
  });
  summary.tenants += 1;

  const mission = await prisma.location.create({
    data: {
      tenantId: acme.id,
      name: 'Acme — Mission St',
      slug: 'mission-st',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      locale: 'en-US',
      phone: '+1-415-555-0142',
      address: {
        line1: '2050 Mission St',
        city: 'San Francisco',
        region: 'CA',
        postalCode: '94110',
        country: 'US',
      },
      openingHours: {
        // 0 = Sunday … 6 = Saturday. Times are HH:MM 24h in location timezone.
        mon: [{ open: '07:00', close: '21:00' }],
        tue: [{ open: '07:00', close: '21:00' }],
        wed: [{ open: '07:00', close: '21:00' }],
        thu: [{ open: '07:00', close: '21:00' }],
        fri: [{ open: '07:00', close: '22:00' }],
        sat: [{ open: '08:00', close: '22:00' }],
        sun: [{ open: '08:00', close: '20:00' }],
      },
    },
  });
  const castro = await prisma.location.create({
    data: {
      tenantId: acme.id,
      name: 'Acme — Castro',
      slug: 'castro',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      locale: 'en-US',
      phone: '+1-415-555-0188',
      address: {
        line1: '500 Castro St',
        city: 'San Francisco',
        region: 'CA',
        postalCode: '94114',
        country: 'US',
      },
      openingHours: {
        mon: [{ open: '08:00', close: '20:00' }],
        tue: [{ open: '08:00', close: '20:00' }],
        wed: [{ open: '08:00', close: '20:00' }],
        thu: [{ open: '08:00', close: '20:00' }],
        fri: [{ open: '08:00', close: '22:00' }],
        sat: [{ open: '09:00', close: '22:00' }],
        sun: [{ open: '09:00', close: '18:00' }],
      },
    },
  });
  summary.locations += 2;

  const bistro = await prisma.tenant.create({
    data: { name: 'Bistro Marais', slug: 'bistro-marais' },
  });
  summary.tenants += 1;

  const paris = await prisma.location.create({
    data: {
      tenantId: bistro.id,
      name: 'Bistro Marais',
      slug: 'paris-3e',
      timezone: 'Europe/Paris',
      currency: 'EUR',
      locale: 'fr-FR',
      phone: '+33 1 42 71 00 00',
      address: {
        line1: '14 Rue de Bretagne',
        city: 'Paris',
        postalCode: '75003',
        country: 'FR',
      },
      openingHours: {
        mon: [],
        tue: [{ open: '12:00', close: '14:30' }, { open: '19:00', close: '22:30' }],
        wed: [{ open: '12:00', close: '14:30' }, { open: '19:00', close: '22:30' }],
        thu: [{ open: '12:00', close: '14:30' }, { open: '19:00', close: '22:30' }],
        fri: [{ open: '12:00', close: '14:30' }, { open: '19:00', close: '23:00' }],
        sat: [{ open: '12:00', close: '23:00' }],
        sun: [{ open: '12:00', close: '15:00' }],
      },
    },
  });
  summary.locations += 1;

  // ─── Users + Memberships ────────────────────────────
  type UserSpec = {
    email: string;
    name: string;
    tenantId: string;
    locationId: string | null;
    role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
  };

  const userSpecs: UserSpec[] = [
    { email: 'owner@acme.test', name: 'Acme Owner', tenantId: acme.id, locationId: null, role: 'OWNER' },
    { email: 'admin@acme.test', name: 'Acme Admin', tenantId: acme.id, locationId: null, role: 'ADMIN' },
    { email: 'manager.mission@acme.test', name: 'Maya Mission (Manager)', tenantId: acme.id, locationId: mission.id, role: 'MANAGER' },
    { email: 'manager.castro@acme.test', name: 'Carlos Castro (Manager)', tenantId: acme.id, locationId: castro.id, role: 'MANAGER' },
    { email: 'server.mission@acme.test', name: 'Sam Server', tenantId: acme.id, locationId: mission.id, role: 'STAFF' },
    { email: 'cook.mission@acme.test', name: 'Chef Casey', tenantId: acme.id, locationId: mission.id, role: 'STAFF' },
    { email: 'server.castro@acme.test', name: 'Sasha Server', tenantId: acme.id, locationId: castro.id, role: 'STAFF' },
    { email: 'viewer@acme.test', name: 'Vera Viewer', tenantId: acme.id, locationId: null, role: 'VIEWER' },
    { email: 'owner@bistro.test', name: 'Bistro Owner', tenantId: bistro.id, locationId: null, role: 'OWNER' },
    { email: 'serveur@bistro.test', name: 'Serveur Bistro', tenantId: bistro.id, locationId: paris.id, role: 'STAFF' },
  ];

  const usersByEmail = new Map<string, { id: string }>();
  for (const spec of userSpecs) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: {
        name: spec.name,
        passwordHash: hashPassword(DEMO_PASSWORD),
        emailVerified: new Date(),
      },
      create: {
        email: spec.email,
        name: spec.name,
        passwordHash: hashPassword(DEMO_PASSWORD),
        emailVerified: new Date(),
      },
    });
    usersByEmail.set(spec.email, { id: user.id });

    // Membership upsert by composite (userId, tenantId, locationId). Postgres
    // treats NULLs as distinct so for tenant-wide memberships we must check.
    if (spec.locationId === null) {
      const existing = await prisma.membership.findFirst({
        where: { userId: user.id, tenantId: spec.tenantId, locationId: null },
      });
      if (!existing) {
        await prisma.membership.create({
          data: { userId: user.id, tenantId: spec.tenantId, role: spec.role },
        });
      } else {
        await prisma.membership.update({
          where: { id: existing.id },
          data: { role: spec.role, status: 'ACTIVE' },
        });
      }
    } else {
      await prisma.membership.upsert({
        where: {
          userId_tenantId_locationId: {
            userId: user.id,
            tenantId: spec.tenantId,
            locationId: spec.locationId,
          },
        },
        update: { role: spec.role, status: 'ACTIVE' },
        create: {
          userId: user.id,
          tenantId: spec.tenantId,
          locationId: spec.locationId,
          role: spec.role,
        },
      });
    }

    summary.users += 1;
  }

  const acmeOwner = usersByEmail.get('owner@acme.test')!;
  const missionManager = usersByEmail.get('manager.mission@acme.test')!;
  const missionServer = usersByEmail.get('server.mission@acme.test')!;
  const missionCook = usersByEmail.get('cook.mission@acme.test')!;
  const castroServer = usersByEmail.get('server.castro@acme.test')!;
  const bistroOwner = usersByEmail.get('owner@bistro.test')!;

  // ─── Acme: Tax Categories + Rates ───────────────────
  const taxFood = await prisma.taxCategory.create({
    data: { tenantId: acme.id, name: 'Food', kind: 'FOOD' },
  });
  const taxBev = await prisma.taxCategory.create({
    data: { tenantId: acme.id, name: 'Non-alcoholic Beverage', kind: 'NON_ALCOHOL_BEV' },
  });
  const taxAlcohol = await prisma.taxCategory.create({
    data: { tenantId: acme.id, name: 'Alcohol', kind: 'ALCOHOL' },
  });
  for (const loc of [mission, castro]) {
    await prisma.taxRate.createMany({
      data: [
        { taxCategoryId: taxFood.id, locationId: loc.id, ratePermille: 825 },
        { taxCategoryId: taxBev.id, locationId: loc.id, ratePermille: 825 },
        { taxCategoryId: taxAlcohol.id, locationId: loc.id, ratePermille: 1000 },
      ],
    });
  }

  // ─── Acme: Categories ───────────────────────────────
  const catDrinks = await prisma.category.create({
    data: { tenantId: acme.id, name: 'Drinks', slug: 'drinks', sortOrder: 1 },
  });
  const catPastries = await prisma.category.create({
    data: { tenantId: acme.id, name: 'Starters', slug: 'starters', sortOrder: 2 },
  });
  const catMains = await prisma.category.create({
    data: { tenantId: acme.id, name: 'Mains', slug: 'mains', sortOrder: 3 },
  });
  const catSides = await prisma.category.create({
    data: { tenantId: acme.id, name: 'Sides', slug: 'sides', sortOrder: 4 },
  });
  const catDesserts = await prisma.category.create({
    data: { tenantId: acme.id, name: 'Desserts', slug: 'desserts', sortOrder: 5 },
  });
  summary.categories += 5;

  // ─── Acme: Modifier Groups + Modifiers ──────────────
  const sizeGroup = await prisma.modifierGroup.create({
    data: { tenantId: acme.id, name: 'Size', minSelections: 1, maxSelections: 1 },
  });
  await prisma.modifier.createMany({
    data: [
      { modifierGroupId: sizeGroup.id, name: 'Small', priceDeltaCents: 0, sortOrder: 1, isDefault: true },
      { modifierGroupId: sizeGroup.id, name: 'Medium', priceDeltaCents: 75, sortOrder: 2 },
      { modifierGroupId: sizeGroup.id, name: 'Large', priceDeltaCents: 150, sortOrder: 3 },
    ],
  });

  const milkGroup = await prisma.modifierGroup.create({
    data: { tenantId: acme.id, name: 'Milk', minSelections: 1, maxSelections: 1 },
  });
  await prisma.modifier.createMany({
    data: [
      { modifierGroupId: milkGroup.id, name: 'Whole', priceDeltaCents: 0, sortOrder: 1, isDefault: true },
      { modifierGroupId: milkGroup.id, name: 'Oat', priceDeltaCents: 50, sortOrder: 2 },
      { modifierGroupId: milkGroup.id, name: 'Almond', priceDeltaCents: 50, sortOrder: 3 },
      { modifierGroupId: milkGroup.id, name: 'Soy', priceDeltaCents: 50, sortOrder: 4 },
    ],
  });

  const toppingsGroup = await prisma.modifierGroup.create({
    data: { tenantId: acme.id, name: 'Toppings', minSelections: 0, maxSelections: 3 },
  });
  await prisma.modifier.createMany({
    data: [
      { modifierGroupId: toppingsGroup.id, name: 'Chocolate Chips', priceDeltaCents: 50, sortOrder: 1 },
      { modifierGroupId: toppingsGroup.id, name: 'Caramel', priceDeltaCents: 75, sortOrder: 2 },
      { modifierGroupId: toppingsGroup.id, name: 'Whipped Cream', priceDeltaCents: 50, sortOrder: 3 },
    ],
  });

  const breadGroup = await prisma.modifierGroup.create({
    data: { tenantId: acme.id, name: 'Bread', minSelections: 1, maxSelections: 1 },
  });
  await prisma.modifier.createMany({
    data: [
      { modifierGroupId: breadGroup.id, name: 'Sourdough', priceDeltaCents: 0, sortOrder: 1, isDefault: true },
      { modifierGroupId: breadGroup.id, name: 'Wheat', priceDeltaCents: 0, sortOrder: 2 },
      { modifierGroupId: breadGroup.id, name: 'Gluten-Free', priceDeltaCents: 200, sortOrder: 3 },
    ],
  });

  const sidesGroup = await prisma.modifierGroup.create({
    data: { tenantId: acme.id, name: 'Sides', minSelections: 0, maxSelections: 2 },
  });
  await prisma.modifier.createMany({
    data: [
      { modifierGroupId: sidesGroup.id, name: 'Side Salad', priceDeltaCents: 300, sortOrder: 1 },
      { modifierGroupId: sidesGroup.id, name: 'Fries', priceDeltaCents: 300, sortOrder: 2 },
      { modifierGroupId: sidesGroup.id, name: 'Soup', priceDeltaCents: 400, sortOrder: 3 },
    ],
  });
  summary.modifierGroups += 5;
  summary.modifiers += 3 + 4 + 3 + 3 + 3;

  // ─── Acme: Menu Items ───────────────────────────────
  type ItemSpec = {
    key: string;
    name: string;
    categoryId: string;
    taxCategoryId: string;
    priceCents: number;
    course: 'APPETIZER' | 'MAIN' | 'DESSERT' | 'SIDE' | 'BEVERAGE' | 'OTHER';
    dietary?: string[];
    allergens?: string[];
    modifierGroups: string[];
    image?: string;
    description?: string;
  };
  // Names + photos sourced from dummyjson.com/recipes so the demo menu looks
  // like a real restaurant rather than placeholder coffee shop items. Keys
  // remain stable (e.g. `latte`, `burger`) because downstream seed code and
  // tests reference items by key; only the user-visible name + image change.
  const CDN = 'https://cdn.dummyjson.com/recipe-images';
  const items: ItemSpec[] = [
    {
      key: 'latte',
      name: 'Mango Lassi',
      categoryId: catDrinks.id,
      taxCategoryId: taxFood.id,
      priceCents: 450,
      course: 'BEVERAGE',
      dietary: ['VEGETARIAN'],
      modifierGroups: [sizeGroup.id, toppingsGroup.id],
      image: `${CDN}/22.webp`,
      description: 'Yogurt blended with ripe mango — sweet, cool, and creamy.',
    },
    {
      key: 'cappuccino',
      name: 'Pineapple Coconut Smoothie',
      categoryId: catDrinks.id,
      taxCategoryId: taxFood.id,
      priceCents: 425,
      course: 'BEVERAGE',
      dietary: ['VEGAN'],
      modifierGroups: [sizeGroup.id],
      image: `${CDN}/50.webp`,
    },
    {
      key: 'drip_coffee',
      name: 'Classic Mojito',
      categoryId: catDrinks.id,
      taxCategoryId: taxFood.id,
      priceCents: 300,
      course: 'BEVERAGE',
      dietary: ['VEGAN'],
      modifierGroups: [sizeGroup.id],
      image: `${CDN}/40.webp`,
    },
    {
      key: 'mocha',
      name: 'Blueberry Banana Smoothie',
      categoryId: catDrinks.id,
      taxCategoryId: taxFood.id,
      priceCents: 525,
      course: 'BEVERAGE',
      dietary: ['VEGETARIAN'],
      modifierGroups: [sizeGroup.id, toppingsGroup.id],
      image: `${CDN}/25.webp`,
    },
    {
      key: 'croissant',
      name: 'Tomato Basil Bruschetta',
      categoryId: catPastries.id,
      taxCategoryId: taxFood.id,
      priceCents: 350,
      course: 'APPETIZER',
      dietary: ['VEGETARIAN'],
      allergens: ['CONTAINS_GLUTEN'],
      modifierGroups: [],
      image: `${CDN}/7.webp`,
    },
    {
      key: 'pain_au_chocolat',
      name: 'Greek Spanakopita',
      categoryId: catPastries.id,
      taxCategoryId: taxFood.id,
      priceCents: 400,
      course: 'APPETIZER',
      dietary: ['VEGETARIAN'],
      allergens: ['CONTAINS_DAIRY', 'CONTAINS_GLUTEN', 'CONTAINS_EGGS'],
      modifierGroups: [],
      image: `${CDN}/38.webp`,
    },
    {
      key: 'bagel',
      name: 'Caprese Bruschetta',
      categoryId: catPastries.id,
      taxCategoryId: taxFood.id,
      priceCents: 350,
      course: 'APPETIZER',
      dietary: ['VEGETARIAN'],
      allergens: ['CONTAINS_DAIRY', 'CONTAINS_GLUTEN'],
      modifierGroups: [],
      image: `${CDN}/41.webp`,
    },
    {
      key: 'avocado_toast',
      name: 'Quinoa Salad with Avocado',
      categoryId: catMains.id,
      taxCategoryId: taxFood.id,
      priceCents: 1200,
      course: 'MAIN',
      dietary: ['VEGAN', 'GLUTEN_FREE'],
      modifierGroups: [sidesGroup.id],
      image: `${CDN}/6.webp`,
    },
    {
      key: 'eggs_benedict',
      name: 'South Indian Masala Dosa',
      categoryId: catMains.id,
      taxCategoryId: taxFood.id,
      priceCents: 1400,
      course: 'MAIN',
      dietary: ['VEGETARIAN'],
      modifierGroups: [],
      image: `${CDN}/28.webp`,
    },
    {
      key: 'burger',
      name: 'Classic Margherita Pizza',
      categoryId: catMains.id,
      taxCategoryId: taxFood.id,
      priceCents: 1600,
      course: 'MAIN',
      dietary: ['VEGETARIAN'],
      allergens: ['CONTAINS_DAIRY', 'CONTAINS_GLUTEN'],
      modifierGroups: [sidesGroup.id],
      image: `${CDN}/1.webp`,
    },
    {
      key: 'caesar_salad',
      name: 'Caprese Salad',
      categoryId: catMains.id,
      taxCategoryId: taxFood.id,
      priceCents: 1300,
      course: 'MAIN',
      dietary: ['VEGETARIAN', 'GLUTEN_FREE'],
      allergens: ['CONTAINS_DAIRY'],
      modifierGroups: [sidesGroup.id],
      image: `${CDN}/9.webp`,
    },
    {
      key: 'grilled_cheese',
      name: 'Mediterranean Chickpea Salad',
      categoryId: catMains.id,
      taxCategoryId: taxFood.id,
      priceCents: 1100,
      course: 'MAIN',
      dietary: ['VEGAN', 'GLUTEN_FREE'],
      modifierGroups: [sidesGroup.id],
      image: `${CDN}/49.webp`,
    },
    {
      key: 'french_fries',
      name: 'Spanish Patatas Bravas',
      categoryId: catSides.id,
      taxCategoryId: taxFood.id,
      priceCents: 500,
      course: 'SIDE',
      dietary: ['VEGAN', 'GLUTEN_FREE'],
      modifierGroups: [],
      image: `${CDN}/31.webp`,
    },
    {
      key: 'side_salad',
      name: 'Mexican Street Corn',
      categoryId: catSides.id,
      taxCategoryId: taxFood.id,
      priceCents: 500,
      course: 'SIDE',
      dietary: ['VEGETARIAN', 'GLUTEN_FREE'],
      allergens: ['CONTAINS_DAIRY'],
      modifierGroups: [],
      image: `${CDN}/26.webp`,
    },
    {
      key: 'cheesecake',
      name: 'Italian Tiramisu',
      categoryId: catDesserts.id,
      taxCategoryId: taxFood.id,
      priceCents: 800,
      course: 'DESSERT',
      dietary: ['VEGETARIAN'],
      allergens: ['CONTAINS_DAIRY', 'CONTAINS_EGGS', 'CONTAINS_GLUTEN'],
      modifierGroups: [],
      image: `${CDN}/23.webp`,
    },
    {
      key: 'brownie',
      name: 'Brazilian Chocolate Brigadeiros',
      categoryId: catDesserts.id,
      taxCategoryId: taxFood.id,
      priceCents: 600,
      course: 'DESSERT',
      dietary: ['VEGETARIAN'],
      allergens: ['CONTAINS_DAIRY', 'CONTAINS_GLUTEN'],
      modifierGroups: [],
    },
  ];

  const itemIdsByKey = new Map<string, string>();
  for (const it of items) {
    const created = await prisma.menuItem.create({
      data: {
        tenantId: acme.id,
        categoryId: it.categoryId,
        taxCategoryId: it.taxCategoryId,
        name: it.name,
        basePriceCents: it.priceCents,
        course: it.course,
        dietaryTags: it.dietary ?? [],
        allergenTags: it.allergens ?? [],
        imageUrl: it.image,
        description: it.description,
      },
    });
    itemIdsByKey.set(it.key, created.id);
    for (let i = 0; i < it.modifierGroups.length; i++) {
      await prisma.menuItemModifierGroup.create({
        data: {
          menuItemId: created.id,
          modifierGroupId: it.modifierGroups[i] as string,
          sortOrder: i,
        },
      });
    }
  }
  summary.items += items.length;

  // Castro location override on Latte: $4.75
  const latteId = itemIdsByKey.get('latte')!;
  await prisma.locationItem.create({
    data: { locationId: castro.id, menuItemId: latteId, priceCents: 475, available: true },
  });
  // 86 Caesar Salad at Castro
  const caesarId = itemIdsByKey.get('caesar_salad')!;
  await prisma.locationItem.create({
    data: { locationId: castro.id, menuItemId: caesarId, available: false },
  });

  // ─── Acme: Menus (Mission St) ───────────────────────
  const allDayMenu = await prisma.menu.create({
    data: {
      locationId: mission.id,
      name: 'All Day',
      description: 'Available all day, every day',
      sortOrder: 1,
      isActive: true,
      schedule: { kind: 'always' } as Prisma.InputJsonValue,
    },
  });
  // Build one MenuSection per Category so the customer-facing menu shows
  // a sidebar with Drinks / Starters / Mains / Sides / Desserts. Without
  // this the menu collapses to a single "Everything" bucket and the
  // sidebar is hidden client-side.
  const sectionOrder: Record<string, number> = {
    [catDrinks.id]: 1,
    [catPastries.id]: 2, // "Starters" category
    [catMains.id]: 3,
    [catSides.id]: 4,
    [catDesserts.id]: 5,
  };
  const sectionNames: Record<string, string> = {
    [catDrinks.id]: 'Drinks',
    [catPastries.id]: 'Starters',
    [catMains.id]: 'Mains',
    [catSides.id]: 'Sides',
    [catDesserts.id]: 'Desserts',
  };
  const itemsByCategory = new Map<string, typeof items>();
  for (const it of items) {
    const list = itemsByCategory.get(it.categoryId) ?? [];
    list.push(it);
    itemsByCategory.set(it.categoryId, list);
  }
  for (const [categoryId, categoryItems] of itemsByCategory) {
    const section = await prisma.menuSection.create({
      data: {
        menuId: allDayMenu.id,
        name: sectionNames[categoryId] ?? 'Other',
        sortOrder: sectionOrder[categoryId] ?? 99,
      },
    });
    let sectionOrderIdx = 0;
    for (const it of categoryItems) {
      await prisma.menuSectionItem.create({
        data: {
          menuSectionId: section.id,
          menuItemId: itemIdsByKey.get(it.key)!,
          sortOrder: sectionOrderIdx++,
        },
      });
    }
  }

  const breakfastMenu = await prisma.menu.create({
    data: {
      locationId: mission.id,
      name: 'Breakfast',
      description: 'Mon–Fri 6:00–11:00',
      sortOrder: 2,
      isActive: true,
      schedule: {
        kind: 'weekly',
        windows: [
          { day: 'MON', start: '06:00', end: '11:00' },
          { day: 'TUE', start: '06:00', end: '11:00' },
          { day: 'WED', start: '06:00', end: '11:00' },
          { day: 'THU', start: '06:00', end: '11:00' },
          { day: 'FRI', start: '06:00', end: '11:00' },
        ],
      } as Prisma.InputJsonValue,
    },
  });
  const breakfastSection = await prisma.menuSection.create({
    data: { menuId: breakfastMenu.id, name: 'Breakfast', sortOrder: 1 },
  });
  const breakfastKeys = [
    'latte',
    'cappuccino',
    'drip_coffee',
    'mocha',
    'croissant',
    'pain_au_chocolat',
    'bagel',
    'avocado_toast',
    'eggs_benedict',
  ];
  let bo = 0;
  for (const k of breakfastKeys) {
    await prisma.menuSectionItem.create({
      data: { menuSectionId: breakfastSection.id, menuItemId: itemIdsByKey.get(k)!, sortOrder: bo++ },
    });
  }

  const happyHourMenu = await prisma.menu.create({
    data: {
      locationId: mission.id,
      name: 'Happy Hour',
      description: 'Mon–Fri 16:00–19:00 — 25% off drinks',
      sortOrder: 3,
      isActive: true,
      schedule: {
        kind: 'weekly',
        windows: [
          { day: 'MON', start: '16:00', end: '19:00' },
          { day: 'TUE', start: '16:00', end: '19:00' },
          { day: 'WED', start: '16:00', end: '19:00' },
          { day: 'THU', start: '16:00', end: '19:00' },
          { day: 'FRI', start: '16:00', end: '19:00' },
        ],
      } as Prisma.InputJsonValue,
    },
  });
  const happyHourSection = await prisma.menuSection.create({
    data: { menuId: happyHourMenu.id, name: 'Drinks (25% off)', sortOrder: 1 },
  });
  // 25% off lattes/cappuccinos/drip
  const hhKeys: Array<{ key: string; price: number }> = [
    { key: 'latte', price: Math.round(450 * 0.75) },
    { key: 'cappuccino', price: Math.round(425 * 0.75) },
    { key: 'drip_coffee', price: Math.round(300 * 0.75) },
  ];
  let ho = 0;
  for (const { key, price } of hhKeys) {
    await prisma.menuSectionItem.create({
      data: {
        menuSectionId: happyHourSection.id,
        menuItemId: itemIdsByKey.get(key)!,
        sortOrder: ho++,
        priceOverrideCents: price,
      },
    });
  }

  // ─── Bistro Marais catalog (smaller) ────────────────
  const bistroTaxFood = await prisma.taxCategory.create({
    data: { tenantId: bistro.id, name: 'TVA', kind: 'FOOD' },
  });
  await prisma.taxRate.create({
    data: { taxCategoryId: bistroTaxFood.id, locationId: paris.id, ratePermille: 2000 },
  });
  const bistroEntrees = await prisma.category.create({
    data: { tenantId: bistro.id, name: 'Entrées', slug: 'entrees', sortOrder: 1 },
  });
  const bistroPlats = await prisma.category.create({
    data: { tenantId: bistro.id, name: 'Plats', slug: 'plats', sortOrder: 2 },
  });
  const bistroDesserts = await prisma.category.create({
    data: { tenantId: bistro.id, name: 'Desserts', slug: 'desserts', sortOrder: 3 },
  });
  summary.categories += 3;

  const bistroItems: Array<{ name: string; categoryId: string; cents: number; course: 'APPETIZER' | 'MAIN' | 'DESSERT' }> = [
    { name: "Soupe à l'oignon", categoryId: bistroEntrees.id, cents: 900, course: 'APPETIZER' },
    { name: 'Salade Niçoise', categoryId: bistroEntrees.id, cents: 1400, course: 'APPETIZER' },
    { name: 'Steak frites', categoryId: bistroPlats.id, cents: 2200, course: 'MAIN' },
    { name: 'Coq au vin', categoryId: bistroPlats.id, cents: 2400, course: 'MAIN' },
    { name: 'Crème brûlée', categoryId: bistroDesserts.id, cents: 800, course: 'DESSERT' },
    { name: 'Tarte tatin', categoryId: bistroDesserts.id, cents: 850, course: 'DESSERT' },
  ];
  for (const it of bistroItems) {
    await prisma.menuItem.create({
      data: {
        tenantId: bistro.id,
        categoryId: it.categoryId,
        taxCategoryId: bistroTaxFood.id,
        name: it.name,
        basePriceCents: it.cents,
        course: it.course,
      },
    });
  }
  summary.items += bistroItems.length;

  // ─── Floor: Mission St ──────────────────────────────
  const sectionMain = await prisma.section.create({
    data: { locationId: mission.id, name: 'Main', sortOrder: 1 },
  });
  const sectionBar = await prisma.section.create({
    data: { locationId: mission.id, name: 'Bar', sortOrder: 2 },
  });

  type TableSeed = {
    label: string;
    capacity: number;
    shape: 'RECT' | 'CIRCLE';
    x: number;
    y: number;
    sectionId: string;
    server?: string;
  };
  const tableSeeds: TableSeed[] = [
    { label: 'T-1', capacity: 2, shape: 'CIRCLE', x: 80, y: 80, sectionId: sectionMain.id, server: missionServer.id },
    { label: 'T-2', capacity: 2, shape: 'CIRCLE', x: 200, y: 80, sectionId: sectionMain.id, server: missionServer.id },
    { label: 'T-3', capacity: 4, shape: 'RECT', x: 320, y: 80, sectionId: sectionMain.id, server: missionServer.id },
    { label: 'T-4', capacity: 4, shape: 'RECT', x: 480, y: 80, sectionId: sectionMain.id },
    { label: 'T-5', capacity: 4, shape: 'RECT', x: 80, y: 240, sectionId: sectionMain.id },
    { label: 'T-6', capacity: 4, shape: 'CIRCLE', x: 240, y: 240, sectionId: sectionMain.id },
    { label: 'T-7', capacity: 6, shape: 'RECT', x: 400, y: 240, sectionId: sectionMain.id },
    { label: 'T-8', capacity: 6, shape: 'RECT', x: 600, y: 240, sectionId: sectionMain.id },
    { label: 'B-1', capacity: 2, shape: 'CIRCLE', x: 80, y: 440, sectionId: sectionBar.id, server: missionServer.id },
    { label: 'B-2', capacity: 2, shape: 'CIRCLE', x: 200, y: 440, sectionId: sectionBar.id },
    { label: 'B-3', capacity: 2, shape: 'CIRCLE', x: 320, y: 440, sectionId: sectionBar.id },
    { label: 'B-4', capacity: 2, shape: 'CIRCLE', x: 440, y: 440, sectionId: sectionBar.id },
  ];
  const tablesByLabel = new Map<string, { id: string }>();
  for (const t of tableSeeds) {
    const tbl = await prisma.table.create({
      data: {
        locationId: mission.id,
        sectionId: t.sectionId,
        label: t.label,
        slug: t.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, ''),
        capacity: t.capacity,
        shape: t.shape,
        positionX: t.x,
        positionY: t.y,
        width: t.shape === 'CIRCLE' ? 80 : 100,
        height: 80,
        assignedServerId: t.server ?? null,
      },
    });
    tablesByLabel.set(t.label, { id: tbl.id });
  }
  summary.tables += tableSeeds.length;

  // ─── Guests (Acme tenant) ───────────────────────────
  const guests = [
    { name: 'Alice Chen', phone: '555-0101' },
    { name: 'Bob Martinez', phone: '555-0102' },
    { name: 'Carol Lee', phone: '555-0103' },
    { name: "Dan O'Brien", phone: '555-0104' },
    { name: 'Erica Park', phone: '555-0105' },
  ];
  const guestRows: Array<{ id: string; name: string }> = [];
  for (const g of guests) {
    const row = await prisma.guest.create({
      data: { tenantId: acme.id, name: g.name, phone: g.phone, lastSeenAt: new Date() },
    });
    guestRows.push({ id: row.id, name: row.name });
  }
  summary.guests += guests.length;

  // ─── Reservations (Mission St) ──────────────────────
  const now = new Date();
  const todayAt = (h: number, m = 0): Date => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const tomorrowAt = (h: number, m = 0): Date => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const daysAgo = (d: number, h = 19): Date => {
    const x = new Date(now);
    x.setDate(x.getDate() - d);
    x.setHours(h, 0, 0, 0);
    return x;
  };

  const t1 = tablesByLabel.get('T-1')!;
  const t3 = tablesByLabel.get('T-3')!;
  const t7 = tablesByLabel.get('T-7')!;

  // 3 future reservations
  await prisma.reservation.create({
    data: {
      locationId: mission.id,
      kind: 'RESERVATION',
      status: 'CONFIRMED',
      guestName: 'Alice Chen',
      guestPhone: '555-0101',
      partySize: 2,
      requestedTime: todayAt(19, 0),
      tableId: t1.id,
      guestId: guestRows[0]!.id,
      createdById: missionManager.id,
    },
  });
  await prisma.reservation.create({
    data: {
      locationId: mission.id,
      kind: 'RESERVATION',
      status: 'PENDING',
      guestName: 'Bob Martinez',
      guestPhone: '555-0102',
      partySize: 4,
      requestedTime: tomorrowAt(18, 30),
      guestId: guestRows[1]!.id,
      createdById: missionManager.id,
    },
  });
  await prisma.reservation.create({
    data: {
      locationId: mission.id,
      kind: 'RESERVATION',
      status: 'CONFIRMED',
      guestName: 'Carol Lee',
      guestPhone: '555-0103',
      partySize: 6,
      requestedTime: tomorrowAt(20, 0),
      tableId: t7.id,
      guestId: guestRows[2]!.id,
      createdById: missionManager.id,
    },
  });

  // 1 walk-in WAITING
  await prisma.reservation.create({
    data: {
      locationId: mission.id,
      kind: 'WALKIN',
      status: 'WAITING',
      guestName: 'Walk-in Party',
      partySize: 3,
      createdById: missionServer.id,
    },
  });
  summary.reservations += 4;

  // 2 completed reservations from earlier this week — link tickets created below.
  // Defer creation until after we generate the tickets pool.

  // ─── Job Roles + Employment Profiles ────────────────
  const roleServer = await prisma.jobRole.create({
    data: { tenantId: acme.id, name: 'Server', color: '#3b82f6' },
  });
  const roleCook = await prisma.jobRole.create({
    data: { tenantId: acme.id, name: 'Cook', color: '#ef4444' },
  });
  const roleBar = await prisma.jobRole.create({
    data: { tenantId: acme.id, name: 'Bar', color: '#a855f7' },
  });
  const roleHost = await prisma.jobRole.create({
    data: { tenantId: acme.id, name: 'Host', color: '#10b981' },
  });

  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);
  const hireDate = new Date(now);
  hireDate.setMonth(hireDate.getMonth() - 6);

  await prisma.employmentProfile.createMany({
    data: [
      {
        userId: missionServer.id,
        locationId: mission.id,
        employmentType: 'PART_TIME',
        hourlyRateCents: 2200,
        hireDate,
      },
      {
        userId: missionCook.id,
        locationId: mission.id,
        employmentType: 'FULL_TIME',
        hourlyRateCents: 2500,
        hireDate,
      },
      {
        userId: castroServer.id,
        locationId: castro.id,
        employmentType: 'PART_TIME',
        hourlyRateCents: 2200,
        hireDate,
      },
    ],
  });

  // ─── Shifts (next 7 days, mix DRAFT and PUBLISHED) ──
  const shiftRoles: Array<{ user: string; role: string }> = [
    { user: missionServer.id, role: roleServer.id },
    { user: missionCook.id, role: roleCook.id },
  ];
  for (let day = 0; day < 7; day++) {
    const base = new Date(now);
    base.setDate(base.getDate() + day);
    base.setHours(8, 0, 0, 0);
    for (const { user, role } of shiftRoles) {
      const start = new Date(base);
      const end = new Date(base);
      end.setHours(end.getHours() + 6);
      await prisma.shift.create({
        data: {
          locationId: mission.id,
          userId: user,
          jobRoleId: role,
          startsAt: start,
          endsAt: end,
          status: day < 3 ? 'PUBLISHED' : 'DRAFT',
          createdById: missionManager.id,
        },
      });
      summary.shifts += 1;
    }
    // Add a host shift on a couple of days
    if (day === 1 || day === 4) {
      const start = new Date(base);
      start.setHours(11, 0, 0, 0);
      const end = new Date(start);
      end.setHours(end.getHours() + 5);
      await prisma.shift.create({
        data: {
          locationId: mission.id,
          userId: missionServer.id,
          jobRoleId: roleHost.id,
          startsAt: start,
          endsAt: end,
          status: 'PUBLISHED',
          createdById: missionManager.id,
        },
      });
      summary.shifts += 1;
    }
  }

  // CLOSED time entries (earlier this week)
  for (let i = 1; i <= 2; i++) {
    const inAt = daysAgo(i, 9);
    const outAt = daysAgo(i, 15);
    await prisma.timeEntry.create({
      data: {
        locationId: mission.id,
        userId: missionServer.id,
        clockedInAt: inAt,
        clockedOutAt: outAt,
        totalBreakMinutes: 30,
      },
    });
    summary.timeEntries += 1;
  }

  // ─── Closed POS tickets (Mission St) ────────────────
  // Tax rate: FOOD 825 permille at Mission.
  const taxRatePermille = 825;
  const itemPriceByKey: Record<string, number> = {};
  for (const it of items) itemPriceByKey[it.key] = it.priceCents;
  const itemKeys = items.map((i) => i.key);

  // Pre-load all modifier rows so we can attach legitimate selections.
  const allModifiers = await prisma.modifier.findMany({
    where: { modifierGroup: { tenantId: acme.id } },
    include: { modifierGroup: { select: { id: true, name: true, minSelections: true, maxSelections: true } } },
  });
  const modsByGroup = new Map<string, typeof allModifiers>();
  for (const m of allModifiers) {
    const g = m.modifierGroup.id;
    const arr = modsByGroup.get(g) ?? [];
    arr.push(m);
    modsByGroup.set(g, arr);
  }
  // Item → attached modifier groups
  const attachments = await prisma.menuItemModifierGroup.findMany({
    where: { menuItem: { tenantId: acme.id } },
    select: { menuItemId: true, modifierGroupId: true },
  });
  const groupsByItem = new Map<string, string[]>();
  for (const a of attachments) {
    const arr = groupsByItem.get(a.menuItemId) ?? [];
    arr.push(a.modifierGroupId);
    groupsByItem.set(a.menuItemId, arr);
  }

  // Build ~30 closed tickets across the past 7 days.
  const TICKET_COUNT = 30;
  const shortByDay = new Map<string, number>();
  function nextShort(businessDay: Date): number {
    const k = businessDay.toISOString().slice(0, 10);
    const next = (shortByDay.get(k) ?? 0) + 1;
    shortByDay.set(k, next);
    return next;
  }

  const guestIds = guestRows.map((g) => g.id);
  let discountedCount = 0;
  let voidedLineUsed = false;
  const closedTicketIds: string[] = [];

  for (let i = 0; i < TICKET_COUNT; i++) {
    const dayOffset = randInt(0, 6);
    const ticketDate = new Date(now);
    ticketDate.setDate(ticketDate.getDate() - dayOffset);
    const closedAt = new Date(ticketDate);
    closedAt.setHours(randInt(8, 21), randInt(0, 59), 0, 0);
    const openedAt = new Date(closedAt);
    openedAt.setMinutes(openedAt.getMinutes() - randInt(15, 60));

    const businessDay = new Date(ticketDate);
    businessDay.setHours(0, 0, 0, 0);

    const lineCount = randInt(1, 4);
    type LineSpec = {
      menuItemId: string;
      name: string;
      unitPriceCents: number;
      quantity: number;
      modifiers: Array<{ id: string; name: string; priceDeltaCents: number; groupName: string }>;
      lineSubtotalCents: number;
      modifiersTotalCents: number;
      status: 'SERVED' | 'VOIDED';
      course: 'APPETIZER' | 'MAIN' | 'DESSERT' | 'SIDE' | 'BEVERAGE' | 'OTHER';
    };
    const lines: LineSpec[] = [];
    for (let li = 0; li < lineCount; li++) {
      const key = pick(itemKeys);
      const itemId = itemIdsByKey.get(key)!;
      const itemSpec = items.find((it) => it.key === key)!;
      const groupIds = groupsByItem.get(itemId) ?? [];
      const selectedMods: LineSpec['modifiers'] = [];
      for (const gId of groupIds) {
        const groupMods = modsByGroup.get(gId) ?? [];
        if (groupMods.length === 0) continue;
        const grp = groupMods[0]!.modifierGroup;
        const minSel = grp.minSelections;
        const maxSel = grp.maxSelections;
        // honor min/max: pick exactly minSel..min(maxSel, mods.length)
        const want = Math.max(minSel, randInt(minSel, Math.min(maxSel, groupMods.length)));
        const shuffled = [...groupMods].sort(() => rand() - 0.5).slice(0, want);
        for (const m of shuffled) {
          selectedMods.push({
            id: m.id,
            name: m.name,
            priceDeltaCents: m.priceDeltaCents,
            groupName: grp.name,
          });
        }
      }
      const qty = randInt(1, 2);
      const { modifiersTotalCents, lineSubtotalCents } = computeLineSubtotalCents({
        unitPriceCents: itemSpec.priceCents,
        quantity: qty,
        modifiers: selectedMods,
      });
      // 1 voided line item across the whole pool
      const voidThis = !voidedLineUsed && i === TICKET_COUNT - 1 && li === 0;
      if (voidThis) voidedLineUsed = true;
      lines.push({
        menuItemId: itemId,
        name: itemSpec.name,
        unitPriceCents: itemSpec.priceCents,
        quantity: qty,
        modifiers: selectedMods,
        lineSubtotalCents,
        modifiersTotalCents,
        status: voidThis ? 'VOIDED' : 'SERVED',
        course: itemSpec.course,
      });
    }

    // Manager discount on 2 tickets (10%)
    let ticketDiscountCents = 0;
    let applyManagerDiscount = false;
    if (discountedCount < 2 && rand() < 0.2) {
      const liveSubtotal = lines.filter((l) => l.status !== 'VOIDED').reduce((a, l) => a + l.lineSubtotalCents, 0);
      ticketDiscountCents = Math.round(liveSubtotal * 0.1);
      applyManagerDiscount = true;
      discountedCount += 1;
    }

    const totals = computeTicketTotalsCents({
      items: lines.map((l) => ({
        lineSubtotalCents: l.lineSubtotalCents,
        lineDiscountCents: 0,
        status: l.status,
      })),
      ticketDiscountCents,
      taxRatePermille,
    });

    const isOnline = rand() < 0.25;
    const linkGuest = rand() < 0.3 ? pick(guestIds) : null;

    const ticket = await prisma.ticket.create({
      data: {
        locationId: mission.id,
        shortNumber: nextShort(businessDay),
        businessDay,
        orderType: isOnline ? 'TAKEOUT' : 'DINE_IN',
        originChannel: isOnline ? 'ONLINE' : 'IN_PERSON',
        status: 'CLOSED',
        openedById: missionServer.id,
        openedAt,
        closedById: missionServer.id,
        closedAt,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        guestId: linkGuest,
      },
    });
    closedTicketIds.push(ticket.id);
    summary.tickets += 1;

    for (const l of lines) {
      const ti = await prisma.ticketItem.create({
        data: {
          ticketId: ticket.id,
          menuItemId: l.menuItemId,
          status: l.status,
          nameSnapshot: l.name,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          modifiersTotalCents: l.modifiersTotalCents,
          lineSubtotalCents: l.lineSubtotalCents,
          course: l.course,
          firedById: missionCook.id,
          firedAt: openedAt,
          servedById: l.status === 'SERVED' ? missionServer.id : null,
          servedAt: l.status === 'SERVED' ? closedAt : null,
          voidedById: l.status === 'VOIDED' ? missionManager.id : null,
          voidedAt: l.status === 'VOIDED' ? closedAt : null,
          voidReason: l.status === 'VOIDED' ? 'Customer changed mind' : null,
        },
      });
      summary.ticketItems += 1;
      for (const m of l.modifiers) {
        await prisma.ticketItemModifier.create({
          data: {
            ticketItemId: ti.id,
            modifierId: m.id,
            nameSnapshot: m.name,
            priceDeltaCents: m.priceDeltaCents,
            modifierGroupName: m.groupName,
          },
        });
      }
    }

    if (applyManagerDiscount) {
      await prisma.discount.create({
        data: {
          locationId: mission.id,
          ticketId: ticket.id,
          kind: 'PERCENT',
          percentBp: 1000,
          computedCents: ticketDiscountCents,
          reason: 'Manager comp',
          appliedById: missionManager.id,
          appliedAt: closedAt,
        },
      });
    }
  }

  // 2 completed reservations (link to two of the closed tickets)
  if (closedTicketIds[0] && closedTicketIds[1]) {
    await prisma.reservation.create({
      data: {
        locationId: mission.id,
        kind: 'RESERVATION',
        status: 'COMPLETED',
        guestName: "Dan O'Brien",
        guestPhone: '555-0104',
        partySize: 2,
        requestedTime: daysAgo(2, 19),
        seatedAt: daysAgo(2, 19),
        completedAt: daysAgo(2, 21),
        tableId: t3.id,
        ticketId: closedTicketIds[0],
        guestId: guestRows[3]!.id,
        createdById: missionManager.id,
      },
    });
    await prisma.reservation.create({
      data: {
        locationId: mission.id,
        kind: 'RESERVATION',
        status: 'COMPLETED',
        guestName: 'Erica Park',
        guestPhone: '555-0105',
        partySize: 4,
        requestedTime: daysAgo(3, 18),
        seatedAt: daysAgo(3, 18),
        completedAt: daysAgo(3, 20),
        tableId: t3.id,
        ticketId: closedTicketIds[1],
        guestId: guestRows[4]!.id,
        createdById: missionManager.id,
      },
    });
    summary.reservations += 2;
  }

  // ─── Online Order Requests ──────────────────────────
  // System user for tenant: required when ticket.openedById on online flows
  // is anonymous. Reuse acmeOwner — schema only requires a valid user FK.
  // 1 PENDING online order
  {
    const businessDay = new Date(now);
    businessDay.setHours(0, 0, 0, 0);
    const pendingTicket = await prisma.ticket.create({
      data: {
        locationId: mission.id,
        shortNumber: nextShort(businessDay),
        businessDay,
        orderType: 'TAKEOUT',
        originChannel: 'ONLINE',
        status: 'OPEN',
        openedById: acmeOwner.id,
        openedAt: new Date(now.getTime() - 10 * 60 * 1000),
        subtotalCents: itemPriceByKey['avocado_toast']!,
        discountCents: 0,
        taxCents: Math.round((itemPriceByKey['avocado_toast']! * 825) / 10000),
        totalCents:
          itemPriceByKey['avocado_toast']! +
          Math.round((itemPriceByKey['avocado_toast']! * 825) / 10000),
      },
    });
    await prisma.ticketItem.create({
      data: {
        ticketId: pendingTicket.id,
        menuItemId: itemIdsByKey.get('avocado_toast')!,
        status: 'NEW',
        nameSnapshot: 'Avocado Toast',
        unitPriceCents: itemPriceByKey['avocado_toast']!,
        quantity: 1,
        modifiersTotalCents: 0,
        lineSubtotalCents: itemPriceByKey['avocado_toast']!,
        course: 'MAIN',
      },
    });
    summary.ticketItems += 1;
    summary.tickets += 1;
    await prisma.onlineOrderRequest.create({
      data: {
        ticketId: pendingTicket.id,
        locationId: mission.id,
        customerName: 'Frankie Online',
        customerPhone: '555-0199',
        customerEmail: 'frankie@example.test',
        pickupAt: new Date(now.getTime() + 30 * 60 * 1000),
        pickupKind: 'ASAP',
        confirmStatus: 'PENDING',
        trackingTokenHash: randomBytes(16).toString('hex'),
      },
    });
    summary.onlineOrders += 1;
  }

  // 1 CONFIRMED online order from yesterday with linked ticket
  {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const businessDay = new Date(yesterday);
    businessDay.setHours(0, 0, 0, 0);
    const closedAt = new Date(yesterday);
    closedAt.setHours(13, 30, 0, 0);
    const openedAt = new Date(closedAt);
    openedAt.setMinutes(openedAt.getMinutes() - 30);
    const burgerPrice = itemPriceByKey['burger']!;
    const friesPrice = itemPriceByKey['french_fries']!;
    const subtotal = burgerPrice + friesPrice;
    const tax = Math.round((subtotal * 825) / 10000);
    const conf = await prisma.ticket.create({
      data: {
        locationId: mission.id,
        shortNumber: nextShort(businessDay),
        businessDay,
        orderType: 'TAKEOUT',
        originChannel: 'ONLINE',
        status: 'CLOSED',
        openedById: acmeOwner.id,
        openedAt,
        closedById: missionManager.id,
        closedAt,
        subtotalCents: subtotal,
        discountCents: 0,
        taxCents: tax,
        totalCents: subtotal + tax,
      },
    });
    await prisma.ticketItem.create({
      data: {
        ticketId: conf.id,
        menuItemId: itemIdsByKey.get('burger')!,
        status: 'SERVED',
        nameSnapshot: 'Burger',
        unitPriceCents: burgerPrice,
        quantity: 1,
        modifiersTotalCents: 0,
        lineSubtotalCents: burgerPrice,
        course: 'MAIN',
        firedById: missionCook.id,
        firedAt: openedAt,
        servedAt: closedAt,
        servedById: missionServer.id,
      },
    });
    await prisma.ticketItem.create({
      data: {
        ticketId: conf.id,
        menuItemId: itemIdsByKey.get('french_fries')!,
        status: 'SERVED',
        nameSnapshot: 'French Fries',
        unitPriceCents: friesPrice,
        quantity: 1,
        modifiersTotalCents: 0,
        lineSubtotalCents: friesPrice,
        course: 'SIDE',
        firedById: missionCook.id,
        firedAt: openedAt,
        servedAt: closedAt,
        servedById: missionServer.id,
      },
    });
    summary.ticketItems += 2;
    summary.tickets += 1;
    await prisma.onlineOrderRequest.create({
      data: {
        ticketId: conf.id,
        locationId: mission.id,
        customerName: 'Greta Online',
        customerPhone: '555-0198',
        pickupAt: closedAt,
        pickupKind: 'SCHEDULED',
        confirmStatus: 'CONFIRMED',
        confirmedAt: openedAt,
        confirmedById: missionManager.id,
        trackingTokenHash: randomBytes(16).toString('hex'),
      },
    });
    summary.onlineOrders += 1;
  }

  // ─── Print credentials table ────────────────────────
  console.warn('\n=== F&B Control Pane — Demo Credentials ===');
  console.warn('Password (all users): %s', DEMO_PASSWORD);
  console.warn('-------------------------------------------');
  for (const u of userSpecs) {
    const scope =
      u.locationId === null
        ? `tenant ${u.tenantId === acme.id ? 'acme' : 'bistro-marais'}`
        : `loc ${u.locationId === mission.id ? 'mission-st' : u.locationId === castro.id ? 'castro' : 'paris-3e'}`;
    console.warn(`${u.role.padEnd(8)} ${u.email.padEnd(34)} ${scope}`);
  }
  console.warn('-------------------------------------------');
  console.warn('Summary: %j', summary);
  console.warn('===========================================\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
