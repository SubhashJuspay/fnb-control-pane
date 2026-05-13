import { Prisma, prisma } from '@repo/db';
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
 *
 * Wave 6 extension: also wipe Acme's POS rows (tickets, ticket items,
 * ticket-item modifiers, discounts) so pos-flow / kds-flow / discount-and-
 * void specs always start with an empty board.
 *
 * Wave 7 extension: also wipe Acme's floor + reservation rows (sections,
 * tables, reservations) so floor-flow / reservation-flow specs always start
 * from a known baseline. Reservations are deleted before tickets because of
 * the `Reservation.ticketId` FK (SetNull, but cleaner to drop in order).
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

  // Wave 8: Acme tickets may have been opened by the tenant's system user
  // (anonymous online-order origin). Clean Acme tickets before deleting
  // non-owner users so the `tickets_opened_by_id_fkey` constraint doesn't
  // fire when we wipe the system user. We re-run the same per-tenant cleanup
  // again below for the rest of Acme's rows; deleting tickets here is
  // idempotent.
  const acmePre = await prisma.tenant.findUnique({ where: { slug: 'acme' } });
  if (acmePre) {
    // Online-order requests reference tickets — drop them first.
    await prisma.onlineOrderRequest.deleteMany({
      where: { location: { tenantId: acmePre.id } },
    });
    await prisma.discount.deleteMany({
      where: { location: { tenantId: acmePre.id } },
    });
    await prisma.reservation.deleteMany({
      where: { location: { tenantId: acmePre.id } },
    });
    await prisma.ticket.deleteMany({
      where: { location: { tenantId: acmePre.id } },
    });
    // Staff/scheduling rows reference users via Restrict FKs (Shift.userId,
    // Shift.createdById, TimeEntry.userId, EmploymentProfile.userId,
    // AvailabilityWindow.userId). Drop them before the user wipe below or
    // the user delete fails when a previous demo seed left these rows
    // pointing at non-owner users.
    await prisma.break.deleteMany({
      where: { timeEntry: { location: { tenantId: acmePre.id } } },
    });
    await prisma.timeEntry.deleteMany({
      where: { location: { tenantId: acmePre.id } },
    });
    await prisma.shift.deleteMany({
      where: { location: { tenantId: acmePre.id } },
    });
    await prisma.availabilityWindow.deleteMany({
      where: { user: { memberships: { some: { tenantId: acmePre.id } } } },
    });
    await prisma.employmentProfile.deleteMany({
      where: { location: { tenantId: acmePre.id } },
    });
    // Detach system user so it can be deleted along with other non-owner
    // users in the next step.
    await prisma.tenant.update({
      where: { id: acmePre.id },
      data: { systemUserId: null },
    });
  }

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

    // Staff & scheduling rows. FK order: breaks → time_entries → shifts →
    // availability_windows → employment_profiles → job_roles. Scope by
    // tenant via the location relation (or tenant directly for job roles).
    await prisma.break.deleteMany({
      where: { timeEntry: { location: { tenantId: acme.id } } },
    });
    await prisma.timeEntry.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    await prisma.shift.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    // Availability windows are user-scoped, not location-scoped. Drop any
    // windows owned by users who still have a membership in Acme — that
    // covers everything seeded by `createScheduleFixtures` and by tests.
    await prisma.availabilityWindow.deleteMany({
      where: { user: { memberships: { some: { tenantId: acme.id } } } },
    });
    await prisma.employmentProfile.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    await prisma.jobRole.deleteMany({ where: { tenantId: acme.id } });

    // POS rows. Cascade removes ticket items / discounts / modifiers when we
    // delete tickets, but discounts can also be ticket-orphaned (line-only),
    // so we wipe them up-front in the right order. Locations belong to Acme,
    // so scoping by `location.tenantId` covers every Acme ticket.
    await prisma.discount.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    // Reservations link to tickets via Reservation.ticketId (SetNull on
    // delete). Drop reservations first so the FK isn't dangling when we wipe
    // tickets — and so cascading section/table deletes (next block) don't
    // hit "tableId still referenced" surprises.
    await prisma.reservation.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    await prisma.ticket.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    // Guests are tenant-scoped; reservation + ticket cleanups above null out
    // FKs back to guest, so wiping guests last is safe.
    await prisma.guest.deleteMany({ where: { tenantId: acme.id } });
    // Floor rows. Tables cascade-delete from a section, but archived/null-
    // section tables don't, so wipe tables first then sections.
    await prisma.table.deleteMany({
      where: { location: { tenantId: acme.id } },
    });
    await prisma.section.deleteMany({
      where: { location: { tenantId: acme.id } },
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

  // The api keeps an in-process TTL cache for analytics rollups (60 s). After
  // we wipe the DB, the next `salesSummary` request would otherwise hit a
  // stale cached `0` from the previous spec and the dashboard would render
  // `$0.00` instead of the freshly-seeded total. Pinging the test-only
  // `/test/reset-cache` endpoint flushes that cache so each spec sees a
  // recomputed result.
  try {
    await fetch(`${apiBaseUrl()}/test/reset-cache`, { method: 'POST' });
  } catch {
    // The endpoint is gated on NODE_ENV !== 'production'. If it isn't
    // mounted (e.g. running against a prod build) we silently skip — most
    // specs don't depend on cache state.
  }
}

function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:4000';
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

export interface CreatePosFixturesOptions {
  /** Tenant slug to scope fixtures to. Defaults to the seeded `acme` tenant. */
  tenantSlug?: string;
  /** Location slug. Defaults to `mission-st`. */
  locationSlug?: string;
}

interface PosFixtures {
  tenantId: string;
  locationId: string;
  ownerUserId: string;
  taxCategoryId: string;
  categoryId: string;
  latteId: string;
  croissantId: string;
  sizeGroupId: string;
  sizeSmallId: string;
  sizeMediumId: string;
  sizeLargeId: string;
}

/**
 * Bootstrap the minimum POS rows the three E2E specs need:
 *   • Food tax category + 8.25% rate at the location.
 *   • Drinks category.
 *   • Size modifier group (required-1, three modifiers).
 *   • Latte ($4.50) attached to the Size group.
 *   • Croissant ($3.50) with no required modifier groups (direct add).
 *
 * Idempotent across reruns. The seeded `owner@acme.test` is already an OWNER
 * (tenant-wide membership), which satisfies both staff + manager scope at any
 * location.
 */
export async function createPosFixtures(
  opts: CreatePosFixturesOptions = {},
): Promise<PosFixtures> {
  const tenantSlug = opts.tenantSlug ?? 'acme';
  const locationSlug = opts.locationSlug ?? 'mission-st';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant not found: ${tenantSlug}`);
  const location = await prisma.location.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
  });
  if (!location) throw new Error(`location not found: ${locationSlug}`);
  const owner = await prisma.user.findUnique({ where: { email: 'owner@acme.test' } });
  if (!owner) throw new Error('owner@acme.test not seeded');

  const tax = await prisma.taxCategory.upsert({
    where: { tenantId_kind: { tenantId: tenant.id, kind: 'FOOD' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Food', kind: 'FOOD' },
  });

  // 8.25% (825 permille) tax rate effective an hour ago so it applies now.
  const existingRate = await prisma.taxRate.findFirst({
    where: { taxCategoryId: tax.id, locationId: location.id },
  });
  if (!existingRate) {
    await prisma.taxRate.create({
      data: {
        taxCategoryId: tax.id,
        locationId: location.id,
        ratePermille: 825,
        effectiveFrom: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
  }

  const category = await prisma.category.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'drinks' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Drinks', slug: 'drinks' },
  });

  const sizeGroup =
    (await prisma.modifierGroup.findFirst({
      where: { tenantId: tenant.id, name: 'Size' },
    })) ??
    (await prisma.modifierGroup.create({
      data: {
        tenantId: tenant.id,
        name: 'Size',
        minSelections: 1,
        maxSelections: 1,
      },
    }));
  const small =
    (await prisma.modifier.findFirst({
      where: { modifierGroupId: sizeGroup.id, name: 'Small' },
    })) ??
    (await prisma.modifier.create({
      data: {
        modifierGroupId: sizeGroup.id,
        name: 'Small',
        priceDeltaCents: 0,
        sortOrder: 0,
      },
    }));
  const medium =
    (await prisma.modifier.findFirst({
      where: { modifierGroupId: sizeGroup.id, name: 'Medium' },
    })) ??
    (await prisma.modifier.create({
      data: {
        modifierGroupId: sizeGroup.id,
        name: 'Medium',
        priceDeltaCents: 75,
        sortOrder: 1,
      },
    }));
  const large =
    (await prisma.modifier.findFirst({
      where: { modifierGroupId: sizeGroup.id, name: 'Large' },
    })) ??
    (await prisma.modifier.create({
      data: {
        modifierGroupId: sizeGroup.id,
        name: 'Large',
        priceDeltaCents: 150,
        sortOrder: 2,
      },
    }));

  const latte =
    (await prisma.menuItem.findFirst({
      where: { tenantId: tenant.id, name: 'Latte' },
    })) ??
    (await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        taxCategoryId: tax.id,
        categoryId: category.id,
        name: 'Latte',
        basePriceCents: 450,
        course: 'BEVERAGE',
        dietaryTags: ['VEGETARIAN'],
      },
    }));
  // Ensure the Size group is attached to Latte (idempotent).
  await prisma.menuItemModifierGroup.upsert({
    where: {
      menuItemId_modifierGroupId: {
        menuItemId: latte.id,
        modifierGroupId: sizeGroup.id,
      },
    },
    update: {},
    create: { menuItemId: latte.id, modifierGroupId: sizeGroup.id, sortOrder: 0 },
  });

  const croissant =
    (await prisma.menuItem.findFirst({
      where: { tenantId: tenant.id, name: 'Croissant' },
    })) ??
    (await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        taxCategoryId: tax.id,
        categoryId: category.id,
        name: 'Croissant',
        basePriceCents: 350,
        course: 'MAIN',
      },
    }));

  return {
    tenantId: tenant.id,
    locationId: location.id,
    ownerUserId: owner.id,
    taxCategoryId: tax.id,
    categoryId: category.id,
    latteId: latte.id,
    croissantId: croissant.id,
    sizeGroupId: sizeGroup.id,
    sizeSmallId: small.id,
    sizeMediumId: medium.id,
    sizeLargeId: large.id,
  };
}

export interface SeededTicketOptions {
  tenantSlug?: string;
  locationSlug?: string;
  /** Item names from `createPosFixtures` to add as ticket items. */
  itemNames?: ReadonlyArray<'Latte' | 'Croissant'>;
  customerLabel?: string;
}

interface SeededTicketResult {
  ticket: {
    id: string;
    shortNumber: number;
    customerLabel: string | null;
  };
  itemIds: string[];
}

/**
 * Compute today's UTC business day for the demo location, mirroring the api
 * helper. We replicate the logic here to avoid pulling the api package into
 * the e2e fixture surface — `mission-st` uses the default 04:00 cutoff in
 * America/Los_Angeles, but for the test environment we collapse to UTC
 * midnight which is what the api ends up with for any time after the cutoff.
 */
function todayBusinessDay(): Date {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
}

async function nextShortNumber(locationId: string, businessDay: Date): Promise<number> {
  const r = await prisma.ticket.aggregate({
    where: { locationId, businessDay },
    _max: { shortNumber: true },
  });
  return (r._max.shortNumber ?? 0) + 1;
}

async function createSeededTicket(
  opts: SeededTicketOptions,
  status: 'NEW' | 'FIRED',
): Promise<SeededTicketResult> {
  const F = await createPosFixtures({
    tenantSlug: opts.tenantSlug,
    locationSlug: opts.locationSlug,
  });
  const itemNames = opts.itemNames ?? ['Latte', 'Croissant'];

  // Resolve item ids + courses + price up-front so we can snapshot.
  const itemRows = await Promise.all(
    itemNames.map(async (name) => {
      const row = await prisma.menuItem.findFirstOrThrow({
        where: { tenantId: F.tenantId, name },
        select: { id: true, name: true, basePriceCents: true, course: true },
      });
      return row;
    }),
  );

  const businessDay = todayBusinessDay();
  const shortNumber = await nextShortNumber(F.locationId, businessDay);

  const ticket = await prisma.ticket.create({
    data: {
      locationId: F.locationId,
      shortNumber,
      businessDay,
      customerLabel: opts.customerLabel ?? 'Sarah',
      orderType: 'DINE_IN',
      status: 'OPEN',
      openedById: F.ownerUserId,
    },
  });

  // Pick a Medium-size modifier for the Latte so the snapshot is realistic.
  const mediumDelta = 75;
  const firedAt = status === 'FIRED' ? new Date(Date.now() - 3 * 60 * 1000) : null;

  const created: string[] = [];
  let runningSubtotal = 0;
  for (const row of itemRows) {
    const isLatte = row.name === 'Latte';
    const modifierTotal = isLatte ? mediumDelta : 0;
    const lineSubtotal = (row.basePriceCents + modifierTotal) * 1;
    const ti = await prisma.ticketItem.create({
      data: {
        ticketId: ticket.id,
        menuItemId: row.id,
        nameSnapshot: row.name,
        unitPriceCents: row.basePriceCents,
        quantity: 1,
        modifiersTotalCents: modifierTotal,
        lineSubtotalCents: lineSubtotal,
        course: row.course,
        status: status === 'FIRED' ? 'FIRED' : 'NEW',
        firedById: status === 'FIRED' ? F.ownerUserId : null,
        firedAt,
      },
    });
    if (isLatte) {
      const sizeMedium = await prisma.modifier.findFirstOrThrow({
        where: { modifierGroupId: F.sizeGroupId, name: 'Medium' },
      });
      await prisma.ticketItemModifier.create({
        data: {
          ticketItemId: ti.id,
          modifierId: sizeMedium.id,
          nameSnapshot: 'Medium',
          priceDeltaCents: mediumDelta,
          modifierGroupName: 'Size',
        },
      });
    }
    created.push(ti.id);
    runningSubtotal += lineSubtotal;
  }

  // For FIRED tickets, totals reflect tax pre-emptively so the KDS card looks
  // realistic — but the close-ticket flow recomputes anyway, so we only need
  // to seed `subtotalCents` correctly for the open-tickets sidebar.
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { subtotalCents: runningSubtotal, totalCents: runningSubtotal },
  });

  return {
    ticket: {
      id: ticket.id,
      shortNumber: ticket.shortNumber,
      customerLabel: ticket.customerLabel,
    },
    itemIds: created,
  };
}

/**
 * Create an OPEN ticket with NEW items at the demo location, bypassing the
 * POS UI. Used by the discount-and-void spec so it can focus on dialogs
 * without re-exercising the full add-item lifecycle.
 */
export async function openSeededTicket(
  opts: SeededTicketOptions = {},
): Promise<SeededTicketResult> {
  return createSeededTicket(opts, 'NEW');
}

/**
 * Create an OPEN ticket whose items are already in FIRED status (firedAt is
 * 3 minutes ago). Used by the kds-flow spec so the kitchen board has a card
 * to show without exercising the open → add → fire UI dance.
 */
export async function fireSeededTicket(
  opts: SeededTicketOptions = {},
): Promise<SeededTicketResult> {
  return createSeededTicket(opts, 'FIRED');
}

export interface CreateFloorFixturesOptions {
  /** Tenant slug to scope fixtures to. Defaults to the seeded `acme` tenant. */
  tenantSlug?: string;
  /** Location slug. Defaults to `mission-st`. */
  locationSlug?: string;
}

interface FloorFixtures {
  tenantId: string;
  locationId: string;
  section: { id: string; name: string };
  table: {
    id: string;
    label: string;
    capacity: number;
    positionX: number;
    positionY: number;
  };
}

/**
 * Bootstrap the minimum floor rows that floor-flow / reservation-flow specs
 * need: a single `Main` section and a 4-top RECT table `T-1` at (100, 100).
 * Idempotent across reruns — re-uses upsert / findFirst so it's safe to call
 * from `beforeEach` after `resetTestData()`.
 */
export async function createFloorFixtures(
  opts: CreateFloorFixturesOptions = {},
): Promise<FloorFixtures> {
  const tenantSlug = opts.tenantSlug ?? 'acme';
  const locationSlug = opts.locationSlug ?? 'mission-st';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant not found: ${tenantSlug}`);
  const location = await prisma.location.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
  });
  if (!location) throw new Error(`location not found: ${locationSlug}`);

  const section = await prisma.section.upsert({
    where: { locationId_name: { locationId: location.id, name: 'Main' } },
    update: { sortOrder: 0, archivedAt: null },
    create: { locationId: location.id, name: 'Main', sortOrder: 0 },
  });

  const table = await prisma.table.upsert({
    where: { locationId_label: { locationId: location.id, label: 'T-1' } },
    update: {
      sectionId: section.id,
      capacity: 4,
      shape: 'RECT',
      positionX: 100,
      positionY: 100,
      width: 80,
      height: 80,
      rotation: 0,
      manualState: 'NONE',
      archivedAt: null,
    },
    create: {
      locationId: location.id,
      sectionId: section.id,
      label: 'T-1',
      capacity: 4,
      shape: 'RECT',
      positionX: 100,
      positionY: 100,
      width: 80,
      height: 80,
      rotation: 0,
    },
  });

  return {
    tenantId: tenant.id,
    locationId: location.id,
    section: { id: section.id, name: section.name },
    table: {
      id: table.id,
      label: table.label,
      capacity: table.capacity,
      positionX: table.positionX,
      positionY: table.positionY,
    },
  };
}

export interface CreateScheduleFixturesOptions {
  /** Tenant slug to scope fixtures to. Defaults to the seeded `acme` tenant. */
  tenantSlug?: string;
  /** Location slug. Defaults to `mission-st`. */
  locationSlug?: string;
}

interface ScheduleFixtures {
  tenantId: string;
  locationId: string;
  ownerUserId: string;
  jobRoleId: string;
  shiftId: string;
}

/**
 * Bootstrap the minimum staff/scheduling rows the time-clock spec needs:
 *   • A "Server" job role at the Acme tenant.
 *   • A PUBLISHED shift for the seeded owner starting in 30 min, lasting 4h.
 *
 * Idempotent across reruns. Used by `time-clock-flow.spec.ts` so the punch-in
 * flow can optionally bind the entry to a real shift.
 */
export async function createScheduleFixtures(
  opts: CreateScheduleFixturesOptions = {},
): Promise<ScheduleFixtures> {
  const tenantSlug = opts.tenantSlug ?? 'acme';
  const locationSlug = opts.locationSlug ?? 'mission-st';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant not found: ${tenantSlug}`);
  const location = await prisma.location.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
  });
  if (!location) throw new Error(`location not found: ${locationSlug}`);
  const owner = await prisma.user.findUnique({ where: { email: 'owner@acme.test' } });
  if (!owner) throw new Error('owner@acme.test not seeded');

  const jobRole = await prisma.jobRole.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Server' } },
    update: { archivedAt: null },
    create: {
      tenantId: tenant.id,
      name: 'Server',
      color: '#6366f1',
    },
  });

  const startsAt = new Date(Date.now() + 30 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
  // No natural unique key on shifts — find an existing not-cancelled shift for
  // the owner overlapping the target window so this stays idempotent.
  const existing = await prisma.shift.findFirst({
    where: {
      locationId: location.id,
      userId: owner.id,
      status: { not: 'CANCELLED' },
      startsAt: { lte: endsAt },
      endsAt: { gte: startsAt },
    },
  });
  const shift =
    existing ??
    (await prisma.shift.create({
      data: {
        locationId: location.id,
        userId: owner.id,
        jobRoleId: jobRole.id,
        startsAt,
        endsAt,
        status: 'PUBLISHED',
        createdById: owner.id,
      },
    }));
  // Ensure status is PUBLISHED in case an existing DRAFT shift got picked up.
  if (shift.status !== 'PUBLISHED') {
    await prisma.shift.update({
      where: { id: shift.id },
      data: { status: 'PUBLISHED' },
    });
  }

  return {
    tenantId: tenant.id,
    locationId: location.id,
    ownerUserId: owner.id,
    jobRoleId: jobRole.id,
    shiftId: shift.id,
  };
}

export interface CloseTicketViaPrismaOptions {
  ticketId: string;
  /**
   * Add a Latte ticket item (re-uses `createCatalogFixtures` Latte) before
   * closing. Defaults to false — set to true for tests that walk the full
   * fire → ready → served → close cycle without using the POS UI.
   */
  withLatteItem?: boolean;
}

/**
 * Close a ticket end-to-end using Prisma directly. Mirrors the POS
 * `closeTicket` mutation enough that the floor query observes the table as
 * AVAILABLE again, including the post-commit `completeReservationAfterClose`
 * side-effect (we replicate it here so reservation-flow tests can verify the
 * reservation ends up COMPLETED without going through the POS UI).
 *
 * Optionally adds a single Latte line in NEW state, then walks
 * NEW → FIRED → READY → SERVED → ticket CLOSED, matching the close-ticket
 * state guard (all items must be SERVED or VOIDED).
 */
export async function closeTicketViaPrisma(
  opts: CloseTicketViaPrismaOptions,
): Promise<void> {
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: opts.ticketId },
    select: {
      id: true,
      locationId: true,
      location: { select: { tenantId: true } },
    },
  });

  if (opts.withLatteItem) {
    const latte = await prisma.menuItem.findFirstOrThrow({
      where: { tenantId: ticket.location.tenantId, name: 'Latte' },
      select: { id: true, name: true, basePriceCents: true, course: true },
    });
    await prisma.ticketItem.create({
      data: {
        ticketId: ticket.id,
        menuItemId: latte.id,
        nameSnapshot: latte.name,
        unitPriceCents: latte.basePriceCents,
        quantity: 1,
        modifiersTotalCents: 0,
        lineSubtotalCents: latte.basePriceCents,
        course: latte.course,
        status: 'NEW',
      },
    });
  }

  // NEW → FIRED → READY → SERVED for every non-voided line.
  const items = await prisma.ticketItem.findMany({
    where: { ticketId: ticket.id, status: { not: 'VOIDED' } },
    select: { id: true },
  });
  if (items.length > 0) {
    const firedAt = new Date(Date.now() - 3 * 60 * 1000);
    await prisma.ticketItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { status: 'SERVED', firedAt },
    });
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  // Mirror `completeReservationAfterClose`: any SEATED reservation linked to
  // this ticket transitions to COMPLETED.
  const reservation = await prisma.reservation.findFirst({
    where: { ticketId: ticket.id, status: 'SEATED' },
    select: { id: true },
  });
  if (reservation) {
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}

export interface CreateAnalyticsFixturesOptions {
  tenantSlug?: string;
  locationSlug?: string;
}

export interface AnalyticsFixtures {
  tenantId: string;
  locationId: string;
  guestId: string;
  ticketId: string;
  latteId: string;
}

export interface ClosedTicketWithItemOptions {
  tenantSlug?: string;
  locationSlug?: string;
  /** Item name to seed as a single line. Defaults to 'Latte'. */
  itemName?: 'Latte' | 'Croissant';
  /** Optional guest to link to the ticket. */
  guestId?: string | null;
  /** Override `closedAt`; defaults to "now". */
  closedAt?: Date;
  /** Pre-tax line subtotal. Defaults to the menu item's base price. */
  unitPriceCents?: number;
  /** Tax rate permille (e.g. 825 = 8.25%). Defaults to 825. */
  taxPermille?: number;
}

export interface ClosedTicketResult {
  ticketId: string;
  itemId: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Seed a single CLOSED ticket with one line item — generic helper used by
 * the analytics-flow spec to drop revenue into the dashboard window. The
 * resulting ticket has correct `subtotalCents` / `taxCents` / `totalCents`
 * so dashboard KPIs match expectations exactly.
 */
export async function closedTicketWithItem(
  opts: ClosedTicketWithItemOptions = {},
): Promise<ClosedTicketResult> {
  const tenantSlug = opts.tenantSlug ?? 'acme';
  const locationSlug = opts.locationSlug ?? 'mission-st';
  const itemName = opts.itemName ?? 'Latte';
  const taxPermille = opts.taxPermille ?? 825;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant not found: ${tenantSlug}`);
  const location = await prisma.location.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: locationSlug } },
  });
  if (!location) throw new Error(`location not found: ${locationSlug}`);
  const owner = await prisma.user.findUnique({
    where: { email: 'owner@acme.test' },
  });
  if (!owner) throw new Error('owner@acme.test not seeded');
  const item = await prisma.menuItem.findFirstOrThrow({
    where: { tenantId: tenant.id, name: itemName },
    select: { id: true, name: true, basePriceCents: true, course: true },
  });

  const closedAt = opts.closedAt ?? new Date();
  // Anchor businessDay at UTC midnight of the closedAt date so it matches
  // what the api computes for Pacific tickets that closed after the 04:00
  // cutoff.
  const businessDay = new Date(
    Date.UTC(
      closedAt.getUTCFullYear(),
      closedAt.getUTCMonth(),
      closedAt.getUTCDate(),
    ),
  );
  const shortNumber = await nextShortNumber(location.id, businessDay);

  const unitPriceCents = opts.unitPriceCents ?? item.basePriceCents;
  const subtotalCents = unitPriceCents;
  // ratePermille is per-ten-thousand to allow 1/100th-of-a-percent precision
  // (matches `apps/api/src/order/tax.ts`). 825 → 8.25%.
  const taxCents = Math.round((subtotalCents * taxPermille) / 10000);
  const totalCents = subtotalCents + taxCents;

  const ticket = await prisma.ticket.create({
    data: {
      locationId: location.id,
      shortNumber,
      businessDay,
      orderType: 'DINE_IN',
      status: 'CLOSED',
      openedById: owner.id,
      openedAt: new Date(closedAt.getTime() - 30 * 60 * 1000),
      closedAt,
      subtotalCents,
      discountCents: 0,
      taxCents,
      totalCents,
      guestId: opts.guestId ?? null,
    },
  });

  const lineItem = await prisma.ticketItem.create({
    data: {
      ticketId: ticket.id,
      menuItemId: item.id,
      nameSnapshot: item.name,
      unitPriceCents,
      quantity: 1,
      modifiersTotalCents: 0,
      lineSubtotalCents: subtotalCents,
      course: item.course,
      status: 'SERVED',
      firedById: owner.id,
      firedAt: new Date(closedAt.getTime() - 25 * 60 * 1000),
      readyAt: new Date(closedAt.getTime() - 15 * 60 * 1000),
      servedAt: new Date(closedAt.getTime() - 10 * 60 * 1000),
    },
  });

  return {
    ticketId: ticket.id,
    itemId: lineItem.id,
    subtotalCents,
    taxCents,
    totalCents,
  };
}

/**
 * Bootstrap the rows the analytics dashboard / insights specs expect:
 *   • A Food tax category + 8.25% rate at the location.
 *   • A Latte menu item ($4.50).
 *   • A Guest "Alice" with phone "555-0100".
 *   • One CLOSED ticket today at noon with 1× Latte (SERVED) linked to Alice.
 *
 * Idempotent at the catalog level (re-uses `createCatalogFixtures`).
 */
export async function createAnalyticsFixtures(
  opts: CreateAnalyticsFixturesOptions = {},
): Promise<AnalyticsFixtures> {
  const tenantSlug = opts.tenantSlug ?? 'acme';
  const locationSlug = opts.locationSlug ?? 'mission-st';

  const catalog = await createCatalogFixtures({ tenantSlug });
  const location = await prisma.location.findUnique({
    where: {
      tenantId_slug: { tenantId: catalog.tenant.id, slug: locationSlug },
    },
  });
  if (!location) throw new Error(`location not found: ${locationSlug}`);

  // 8.25% tax rate at this location.
  const existingRate = await prisma.taxRate.findFirst({
    where: { taxCategoryId: catalog.tax.id, locationId: location.id },
  });
  if (!existingRate) {
    await prisma.taxRate.create({
      data: {
        taxCategoryId: catalog.tax.id,
        locationId: location.id,
        ratePermille: 825,
        effectiveFrom: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
  }

  // Alice. resetTestData clears guests so this create is safe.
  const guest = await prisma.guest.create({
    data: {
      tenantId: catalog.tenant.id,
      name: 'Alice',
      phone: '555-0100',
    },
  });

  // Build "today at 12:00 in America/Los_Angeles" by anchoring noon UTC and
  // letting the api re-bucket; the actual hour bucket isn't asserted, only
  // that some bar appears on the hours chart.
  const now = new Date();
  const noonUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 19),
  );

  const ticket = await closedTicketWithItem({
    tenantSlug,
    locationSlug,
    itemName: 'Latte',
    guestId: guest.id,
    closedAt: noonUtc,
  });

  // Mirror `closeTicket`'s post-commit Guest.lastSeenAt bump so the UI
  // shows visitCount=1 immediately.
  await prisma.guest.update({
    where: { id: guest.id },
    data: { lastSeenAt: noonUtc },
  });

  return {
    tenantId: catalog.tenant.id,
    locationId: location.id,
    guestId: guest.id,
    ticketId: ticket.ticketId,
    latteId: catalog.latte.id,
  };
}

export interface CreateOnlineOrderFixturesOptions {
  tenantSlug?: string;
  locationSlug?: string;
}

/**
 * Bootstrap the minimum rows the online-order E2E spec needs:
 *   • Reuses `createPosFixtures` so Latte has the Size group attached.
 *   • Adds a published Menu / Section attached to the location with Latte +
 *     Croissant in the Drinks section, so `publicLocationBySlug` returns it.
 *
 * Idempotent across reruns.
 */
export async function createOnlineOrderFixtures(
  opts: CreateOnlineOrderFixturesOptions = {},
): Promise<{
  tenantId: string;
  locationId: string;
  latteId: string;
  croissantId: string;
  sizeMediumId: string;
  menuId: string;
}> {
  const tenantSlug = opts.tenantSlug ?? 'acme';
  const locationSlug = opts.locationSlug ?? 'mission-st';
  const pos = await createPosFixtures({ tenantSlug, locationSlug });

  // The closed-state guard reads `openingHours` and refuses submission when
  // the location is closed. The demo seed sets realistic hours that may
  // round-trip to "closed" depending on when the suite runs — clear them so
  // online-order tests are time-of-day independent. Tests that exercise the
  // closed-state explicitly should write hours back themselves.
  await prisma.location.update({
    where: { id: pos.locationId },
    data: { openingHours: Prisma.DbNull },
  });

  // Find or create the menu for this location.
  const existingMenu = await prisma.menu.findFirst({
    where: { locationId: pos.locationId, name: 'All Day' },
  });
  const menu =
    existingMenu ??
    (await prisma.menu.create({
      data: {
        locationId: pos.locationId,
        name: 'All Day',
        description: 'Available all day',
        // `kind: 'always'` schedule = active 24/7. Pothos input casts this
        // through `as never`; the create call accepts plain JSON.
        schedule: { kind: 'always' } as never,
        isActive: true,
        sortOrder: 0,
      },
    }));

  const existingSection = await prisma.menuSection.findFirst({
    where: { menuId: menu.id, name: 'Drinks' },
  });
  const section =
    existingSection ??
    (await prisma.menuSection.create({
      data: { menuId: menu.id, name: 'Drinks', sortOrder: 0 },
    }));

  // Attach Latte + Croissant to the section. menuSectionItem has no unique
  // constraint we can upsert against, so use find-or-create per item.
  for (const [idx, menuItemId] of [pos.latteId, pos.croissantId].entries()) {
    const existing = await prisma.menuSectionItem.findFirst({
      where: { menuSectionId: section.id, menuItemId },
    });
    if (!existing) {
      await prisma.menuSectionItem.create({
        data: {
          menuSectionId: section.id,
          menuItemId,
          sortOrder: idx,
        },
      });
    }
  }

  return {
    tenantId: pos.tenantId,
    locationId: pos.locationId,
    latteId: pos.latteId,
    croissantId: pos.croissantId,
    sizeMediumId: pos.sizeMediumId,
    menuId: menu.id,
  };
}
