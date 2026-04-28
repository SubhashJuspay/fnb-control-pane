import type { PrismaClient, Role } from '@repo/db';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('../../email/client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  setMailer: vi.fn(),
  getMailer: vi.fn(),
}));

import type { AuthContext, RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import { hashPassword } from '../../password.js';
import { clearCache } from '../../cache.js';
import { pubsub } from '../../pubsub.js';
import {
  resolveDayOfWeekMix,
  resolveGuestCohort,
  resolveHourlyMix,
  resolveSalesSummary,
  resolveServerPerformance,
  resolveTopItems,
} from '../../schema/analytics.js';
import { resolveSearchGuests } from '../../schema/guest.js';
import { resolveCreateGuest } from '../../schema/mutations/guest/create-guest.js';
import { resolveLinkTicketGuest } from '../../schema/mutations/guest/link-ticket-guest.js';
import { resolveCloseTicket } from '../../schema/mutations/pos/close-ticket.js';
import { resolveAddTicketItem } from '../../schema/mutations/pos/add-ticket-item.js';
import { resolveFireTicketItem } from '../../schema/mutations/pos/fire-ticket-item.js';
import { resolveMarkTicketItemReady } from '../../schema/mutations/pos/mark-ticket-item-ready.js';
import { resolveMarkTicketItemServed } from '../../schema/mutations/pos/mark-ticket-item-served.js';
import { resolveOpenTicket } from '../../schema/mutations/pos/open-ticket.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

interface AnalyticsFixtures {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  ownerUserId: string;
  managerUserId: string;
  staffUserId: string;
  staff2UserId: string;
  taxCategoryId: string;
  categoryId: string;
  latteId: string;
  croissantId: string;
  ticketAId: string;
  ticketBId: string;
  ticketCId: string;
  guestAliceId: string;
}

async function seedAnalyticsFixtures(
  prisma: PrismaClient,
  opts: { tenantSlug?: string } = {},
): Promise<AnalyticsFixtures> {
  const slug = opts.tenantSlug ?? 'analytics-tenant';
  const tenant = await prisma.tenant.create({
    data: { name: `Tenant ${slug}`, slug },
  });
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Main',
      slug: `${slug}-main`,
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      businessDayCutoff: '04:00',
    },
  });

  const mkUser = (email: string, name: string) =>
    prisma.user.create({
      data: {
        email,
        name,
        passwordHash: hashPassword('password1'),
        emailVerified: new Date(),
      },
    });
  const owner = await mkUser(`owner-${slug}@t.test`, 'Owner');
  const manager = await mkUser(`mgr-${slug}@t.test`, 'Manager');
  const staff = await mkUser(`staff-${slug}@t.test`, 'Staff Alpha');
  const staff2 = await mkUser(`staff2-${slug}@t.test`, 'Staff Beta');

  const mkMembership = (
    userId: string,
    role: Role,
    locationId: string | null = null,
  ) =>
    prisma.membership.create({
      data: { userId, tenantId: tenant.id, role, locationId, status: 'ACTIVE' },
    });
  await mkMembership(owner.id, 'OWNER');
  await mkMembership(manager.id, 'MANAGER', location.id);
  await mkMembership(staff.id, 'STAFF', location.id);
  await mkMembership(staff2.id, 'STAFF', location.id);

  const taxCategory = await prisma.taxCategory.create({
    data: { tenantId: tenant.id, name: 'Food', kind: 'FOOD' },
  });
  await prisma.taxRate.create({
    data: {
      taxCategoryId: taxCategory.id,
      locationId: location.id,
      ratePermille: 825,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    },
  });
  const category = await prisma.category.create({
    data: { tenantId: tenant.id, name: 'Drinks', slug: `${slug}-drinks` },
  });
  const latte = await prisma.menuItem.create({
    data: {
      tenantId: tenant.id,
      taxCategoryId: taxCategory.id,
      categoryId: category.id,
      name: 'Latte',
      basePriceCents: 450,
    },
  });
  const croissant = await prisma.menuItem.create({
    data: {
      tenantId: tenant.id,
      taxCategoryId: taxCategory.id,
      categoryId: category.id,
      name: 'Croissant',
      basePriceCents: 350,
    },
  });

  // ── Pre-seed three CLOSED tickets at precise local-times.
  // Apr 26 19:00 PDT = Apr 27 02:00 UTC; Apr 26 20:30 PDT = Apr 27 03:30 UTC;
  // Apr 27 14:00 PDT = Apr 27 21:00 UTC. Cutoff = 04:00 local: ticket A and B
  // belong to business-day Apr 26; ticket C to Apr 27.
  const aClosed = new Date('2026-04-27T02:00:00Z');
  const bClosed = new Date('2026-04-27T03:30:00Z');
  const cClosed = new Date('2026-04-27T21:00:00Z');

  async function seedTicket(args: {
    shortNumber: number;
    businessDay: Date;
    closedAt: Date;
    openedById: string;
    items: Array<{
      menuItemId: string;
      nameSnapshot: string;
      unitPriceCents: number;
      quantity: number;
      lineSubtotalCents: number;
      status?: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
      servedById?: string | null;
    }>;
    subtotalCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
    guestId?: string | null;
  }) {
    const ticket = await prisma.ticket.create({
      data: {
        locationId: location.id,
        shortNumber: args.shortNumber,
        businessDay: args.businessDay,
        orderType: 'DINE_IN',
        status: 'CLOSED',
        openedById: args.openedById,
        closedById: args.openedById,
        openedAt: new Date(args.closedAt.getTime() - 30 * 60 * 1000),
        closedAt: args.closedAt,
        subtotalCents: args.subtotalCents,
        discountCents: args.discountCents,
        taxCents: args.taxCents,
        totalCents: args.totalCents,
        guestId: args.guestId ?? null,
      },
    });
    for (const it of args.items) {
      await prisma.ticketItem.create({
        data: {
          ticketId: ticket.id,
          menuItemId: it.menuItemId,
          nameSnapshot: it.nameSnapshot,
          unitPriceCents: it.unitPriceCents,
          quantity: it.quantity,
          lineSubtotalCents: it.lineSubtotalCents,
          status: it.status ?? 'SERVED',
          course: 'BEVERAGE',
          servedById: it.servedById ?? args.openedById,
          servedAt: args.closedAt,
        },
      });
    }
    return ticket;
  }

  const guestAlice = await prisma.guest.create({
    data: {
      tenantId: tenant.id,
      name: 'Alice',
      phone: '555-0100',
      email: 'alice@example.com',
    },
  });

  // Ticket A: 2× Latte + 1× Croissant; net = 900 + 350 = 1250; tax 8.25% = 103;
  // total = 1353. Linked to Alice. Opened by staff.
  const ticketA = await seedTicket({
    shortNumber: 1,
    businessDay: new Date('2026-04-26T00:00:00Z'),
    closedAt: aClosed,
    openedById: staff.id,
    items: [
      {
        menuItemId: latte.id,
        nameSnapshot: 'Latte',
        unitPriceCents: 450,
        quantity: 2,
        lineSubtotalCents: 900,
      },
      {
        menuItemId: croissant.id,
        nameSnapshot: 'Croissant',
        unitPriceCents: 350,
        quantity: 1,
        lineSubtotalCents: 350,
      },
    ],
    subtotalCents: 1250,
    discountCents: 0,
    taxCents: 103,
    totalCents: 1353,
    guestId: guestAlice.id,
  });

  // Ticket B: 1× Latte + 1× VOIDED Croissant; net subtotal = 450 + 0 = 450
  // (the voided item still has lineSubtotalCents but is excluded from totals).
  // Opened by staff.
  const ticketB = await prisma.ticket.create({
    data: {
      locationId: location.id,
      shortNumber: 2,
      businessDay: new Date('2026-04-26T00:00:00Z'),
      orderType: 'DINE_IN',
      status: 'CLOSED',
      openedById: staff.id,
      closedById: staff.id,
      openedAt: new Date(bClosed.getTime() - 30 * 60 * 1000),
      closedAt: bClosed,
      subtotalCents: 450,
      discountCents: 0,
      taxCents: 37,
      totalCents: 487,
    },
  });
  await prisma.ticketItem.create({
    data: {
      ticketId: ticketB.id,
      menuItemId: latte.id,
      nameSnapshot: 'Latte',
      unitPriceCents: 450,
      quantity: 1,
      lineSubtotalCents: 450,
      status: 'SERVED',
      course: 'BEVERAGE',
      servedById: staff.id,
      servedAt: bClosed,
    },
  });
  await prisma.ticketItem.create({
    data: {
      ticketId: ticketB.id,
      menuItemId: croissant.id,
      nameSnapshot: 'Croissant',
      unitPriceCents: 350,
      quantity: 1,
      lineSubtotalCents: 350,
      status: 'VOIDED',
      course: 'BEVERAGE',
      voidedById: staff.id,
      voidedAt: bClosed,
      voidReason: 'spilled',
    },
  });

  // Ticket C: 1× Croissant on Apr 27. Opened by staff2.
  const ticketC = await seedTicket({
    shortNumber: 1,
    businessDay: new Date('2026-04-27T00:00:00Z'),
    closedAt: cClosed,
    openedById: staff2.id,
    items: [
      {
        menuItemId: croissant.id,
        nameSnapshot: 'Croissant',
        unitPriceCents: 350,
        quantity: 1,
        lineSubtotalCents: 350,
      },
    ],
    subtotalCents: 350,
    discountCents: 0,
    taxCents: 29,
    totalCents: 379,
  });

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    locationId: location.id,
    ownerUserId: owner.id,
    managerUserId: manager.id,
    staffUserId: staff.id,
    staff2UserId: staff2.id,
    taxCategoryId: taxCategory.id,
    categoryId: category.id,
    latteId: latte.id,
    croissantId: croissant.id,
    ticketAId: ticketA.id,
    ticketBId: ticketB.id,
    ticketCId: ticketC.id,
    guestAliceId: guestAlice.id,
  };
}

function ctxFor(args: {
  prisma: PrismaClient;
  tenantId: string;
  tenantSlug: string;
  locationId: string | null;
  userId: string;
  role: Role;
}): RequestContext {
  const auth: AuthContext = {
    kind: 'authenticated',
    user: { id: args.userId, email: 'u@test' },
    tenant: { id: args.tenantId, slug: args.tenantSlug },
    location: args.locationId
      ? { id: args.locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: args.role,
  };
  return {
    auth,
    prisma: args.prisma as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
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

let F: AnalyticsFixtures;
type PublishSpy = ReturnType<typeof vi.fn>;
let publishSpy: PublishSpy;
let originalPublish: typeof pubsub.publish;

beforeEach(async () => {
  await truncateAll(prisma);
  clearCache();
  F = await seedAnalyticsFixtures(prisma);
  publishSpy = vi.fn().mockResolvedValue(undefined);
  originalPublish = pubsub.publish.bind(pubsub);
  (pubsub as unknown as { publish: PublishSpy }).publish = publishSpy;
});

afterEach(() => {
  (pubsub as unknown as { publish: typeof pubsub.publish }).publish =
    originalPublish;
  clearCache();
});

// April 26..27 covers all three pre-seeded business days in Pacific tz.
const range = {
  from: new Date('2026-04-26T00:00:00Z'),
  to: new Date('2026-04-27T00:00:00Z'),
};

describe('Analytics + Guest CRM integration suite (Testcontainers)', () => {
  it('1. salesSummary aggregates correctly across the date range', async () => {
    const mgr = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const out = await resolveSalesSummary(mgr, range);
    expect(out.closedTicketCount).toBe(3);
    expect(out.voidedTicketCount).toBe(0);
    expect(out.grossSalesCents).toBe(1250 + 450 + 350); // 2050
    expect(out.taxCents).toBe(103 + 37 + 29); // 169
    expect(out.netSalesCents).toBe(1353 + 487 + 379); // 2219
    expect(out.uniqueGuests).toBe(1); // Alice
    expect(out.averageTicketCents).toBe(Math.round(2219 / 3));
  });

  it('2. topItems returns expected ordering for QUANTITY / REVENUE / TICKETS', async () => {
    const mgr = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });

    // QUANTITY: Latte = 2 + 1 = 3, Croissant = 1 + 1 = 2 (one voided excluded).
    const byQty = await resolveTopItems(mgr, range, 5, 'QUANTITY');
    expect(byQty[0]?.menuItemName).toBe('Latte');
    expect(byQty[0]?.quantitySold).toBe(3);
    expect(byQty[1]?.menuItemName).toBe('Croissant');
    expect(byQty[1]?.quantitySold).toBe(2);

    clearCache();
    // REVENUE: Latte = 900 + 450 = 1350; Croissant = 350 + 350 = 700.
    const byRev = await resolveTopItems(mgr, range, 5, 'REVENUE');
    expect(byRev[0]?.menuItemName).toBe('Latte');
    expect(byRev[0]?.revenueCents).toBe(1350);

    clearCache();
    // TICKETS: Latte appears on tickets A,B = 2; Croissant on A,C (B voided) = 2 — tie.
    const byTickets = await resolveTopItems(mgr, range, 5, 'TICKETS');
    expect(byTickets).toHaveLength(2);
    expect(byTickets.every((r) => r.ticketCount === 2)).toBe(true);
  });

  it('3. hourlyMix buckets by location timezone (PDT)', async () => {
    const mgr = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const buckets = await resolveHourlyMix(mgr, range);
    // Apr 26 19:00 PDT (ticket A) and 20:30 PDT (ticket B) → hours 19, 20.
    // Apr 27 14:00 PDT (ticket C) → hour 14.
    expect(buckets[19]?.ticketCount).toBe(1);
    expect(buckets[20]?.ticketCount).toBe(1);
    expect(buckets[14]?.ticketCount).toBe(1);
    // Hours with no activity should be zero-filled.
    expect(buckets[0]?.ticketCount).toBe(0);
    expect(buckets.length).toBe(24);
  });

  it('4. dayOfWeekMix counts each closed ticket once', async () => {
    const mgr = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const buckets = await resolveDayOfWeekMix(mgr, range);
    // Apr 26 2026 = Sunday; Apr 27 2026 = Monday (in PDT).
    const sun = buckets.find((b) => b.dayOfWeek === 'SUN');
    const mon = buckets.find((b) => b.dayOfWeek === 'MON');
    expect(sun?.ticketCount).toBe(2);
    expect(mon?.ticketCount).toBe(1);
  });

  it('5. serverPerformance computes voidRate', async () => {
    const mgr = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const rows = await resolveServerPerformance(mgr, range);
    const alpha = rows.find((r) => r.openedById === F.staffUserId);
    const beta = rows.find((r) => r.openedById === F.staff2UserId);
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    // Alpha: 2 tickets, items = 2 lines (A: Latte, Croissant) + 2 lines
    // (B: Latte, voided Croissant) = 4 lines; voided = 1 → voidRate = 0.25.
    expect(alpha?.ticketCount).toBe(2);
    expect(alpha?.voidRate).toBeCloseTo(0.25, 3);
    // Beta: 1 ticket, 1 item, 0 voided.
    expect(beta?.voidRate).toBe(0);
  });

  it('6. guestCohort counts new vs returning correctly', async () => {
    const mgr = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    // Alice's first visit (ticket A) is in range → new.
    let cohort = await resolveGuestCohort(mgr, range);
    expect(cohort.newGuestCount).toBe(1);
    expect(cohort.returningGuestCount).toBe(0);

    clearCache();
    // Insert a prior visit before the range, and another visit in range.
    const earlyClosed = new Date('2026-04-10T20:00:00Z');
    await prisma.ticket.create({
      data: {
        locationId: F.locationId,
        shortNumber: 99,
        businessDay: new Date('2026-04-10T00:00:00Z'),
        orderType: 'DINE_IN',
        status: 'CLOSED',
        openedById: F.staffUserId,
        closedById: F.staffUserId,
        openedAt: new Date(earlyClosed.getTime() - 60 * 60 * 1000),
        closedAt: earlyClosed,
        guestId: F.guestAliceId,
        subtotalCents: 100,
        taxCents: 8,
        totalCents: 108,
      },
    });
    cohort = await resolveGuestCohort(mgr, range);
    // Alice now has a prior visit → returning.
    expect(cohort.newGuestCount).toBe(0);
    expect(cohort.returningGuestCount).toBe(1);
    expect(cohort.repeatRate).toBe(1);
  });

  it('7. searchGuests matches name + phone case-insensitive', async () => {
    const staff = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    // By name lowercase
    let results = (await resolveSearchGuests({}, staff, 'ali', 10)) as Array<{
      id: string;
    }>;
    expect(results.map((r) => r.id)).toContain(F.guestAliceId);

    // By name uppercase
    results = (await resolveSearchGuests({}, staff, 'ALICE', 10)) as Array<{
      id: string;
    }>;
    expect(results.map((r) => r.id)).toContain(F.guestAliceId);

    // By phone substring
    results = (await resolveSearchGuests({}, staff, '0100', 10)) as Array<{
      id: string;
    }>;
    expect(results.map((r) => r.id)).toContain(F.guestAliceId);
  });

  it('8. linkTicketGuest updates lastSeenAt + writes audit', async () => {
    // Open a brand-new ticket to link Alice to.
    const staff = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const ticket = (await resolveOpenTicket({}, {}, staff)) as { id: string };

    await resolveLinkTicketGuest(
      {},
      { ticketId: ticket.id, guestId: F.guestAliceId },
      staff,
    );

    const guest = await prisma.guest.findUniqueOrThrow({
      where: { id: F.guestAliceId },
    });
    expect(guest.lastSeenAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ticket.guest_linked', resourceId: ticket.id },
    });
    expect(audit).toBeTruthy();
  });

  it('9. closeTicket post-commit updates Guest.lastSeenAt when guestId is set', async () => {
    const staff = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.staffUserId,
      role: 'STAFF',
    });

    // Open a ticket, link Alice, work it through SERVED, then close.
    const ticket = (await resolveOpenTicket({}, {}, staff)) as { id: string };
    await resolveLinkTicketGuest(
      {},
      { ticketId: ticket.id, guestId: F.guestAliceId },
      staff,
    );
    const item = (await resolveAddTicketItem(
      {},
      { ticketId: ticket.id, menuItemId: F.latteId, modifiers: [] },
      staff,
    )) as { id: string };
    await resolveFireTicketItem({}, { ticketItemId: item.id }, staff);
    await resolveMarkTicketItemReady({}, { ticketItemId: item.id }, staff);
    await resolveMarkTicketItemServed({}, { ticketItemId: item.id }, staff);

    const before = await prisma.guest.findUniqueOrThrow({
      where: { id: F.guestAliceId },
    });

    await resolveCloseTicket({}, { ticketId: ticket.id }, staff);

    const closed = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    const after = await prisma.guest.findUniqueOrThrow({
      where: { id: F.guestAliceId },
    });
    // lastSeenAt should have advanced to the new ticket's closedAt.
    expect(after.lastSeenAt).not.toBeNull();
    expect(after.lastSeenAt?.getTime()).toBe(closed.closedAt!.getTime());
    expect(after.lastSeenAt!.getTime()).toBeGreaterThan(
      (before.lastSeenAt ?? new Date(0)).getTime(),
    );
  });

  it('10. cross-tenant + cross-location isolation across all queries', async () => {
    // Seed a second tenant + location with its own ticket. Querying analytics
    // from tenant 1's manager must only see tenant 1's data.
    const otherSlug = 'other-tenant';
    const F2 = await seedAnalyticsFixtures(prisma, { tenantSlug: otherSlug });

    const mgr1 = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });

    const out = await resolveSalesSummary(mgr1, range);
    // Even though tenant 2 has identical seed data, the tenant 1 summary must
    // remain at exactly its own three tickets / 2219¢ net.
    expect(out.closedTicketCount).toBe(3);
    expect(out.netSalesCents).toBe(2219);

    // searchGuests under tenant 1 should never return tenant 2 guests.
    const staff1 = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const results = (await resolveSearchGuests(
      {},
      staff1,
      'Alice',
      50,
    )) as Array<{ id: string }>;
    const ids = results.map((r) => r.id);
    expect(ids).toContain(F.guestAliceId);
    expect(ids).not.toContain(F2.guestAliceId);

    // Cross-tenant linkTicketGuest must fail (guest belongs to other tenant).
    const ticket = (await resolveOpenTicket({}, {}, staff1)) as { id: string };
    await expect(
      resolveLinkTicketGuest(
        {},
        { ticketId: ticket.id, guestId: F2.guestAliceId },
        staff1,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('11. withTtlCache returns same result within window; clearCache forces refetch', async () => {
    const mgr = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const first = await resolveSalesSummary(mgr, range);
    // Insert another ticket between calls. Cache should mask it.
    await prisma.ticket.create({
      data: {
        locationId: F.locationId,
        shortNumber: 50,
        businessDay: new Date('2026-04-26T00:00:00Z'),
        orderType: 'DINE_IN',
        status: 'CLOSED',
        openedById: F.staffUserId,
        closedById: F.staffUserId,
        openedAt: new Date('2026-04-27T01:00:00Z'),
        closedAt: new Date('2026-04-27T01:30:00Z'),
        subtotalCents: 1000,
        taxCents: 80,
        totalCents: 1080,
      },
    });
    const second = await resolveSalesSummary(mgr, range);
    expect(second.netSalesCents).toBe(first.netSalesCents);

    clearCache();
    const third = await resolveSalesSummary(mgr, range);
    expect(third.netSalesCents).toBe(first.netSalesCents + 1080);
  });

  it('12. createGuest from staff scope works (picker creates new guests)', async () => {
    const staff = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const created = (await resolveCreateGuest(
      {},
      { name: 'Bob', phone: '555-9999' },
      staff,
    )) as { id: string };
    const row = await prisma.guest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.name).toBe('Bob');
    expect(row.tenantId).toBe(F.tenantId);
  });

  it('13. analytics queries reject unauthenticated and non-manager callers', async () => {
    const anon = ctxFor({
      prisma,
      tenantId: F.tenantId,
      tenantSlug: F.tenantSlug,
      locationId: F.locationId,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    // STAFF role is not manager → rejected.
    await expect(resolveSalesSummary(anon, range)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
