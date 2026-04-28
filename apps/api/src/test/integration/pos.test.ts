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

// Stub the nodemailer client at module load — anything that imports
// '../email/client.js' transitively gets a no-op sendEmail. Must precede
// any resolver imports.
vi.mock('../../email/client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  setMailer: vi.fn(),
  getMailer: vi.fn(),
}));

import type { AuthContext, RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { hashPassword } from '../../password.js';
import { pubsub, ticketChannelName } from '../../pubsub.js';
import { resolveAddTicketItem } from '../../schema/mutations/pos/add-ticket-item.js';
import { resolveApplyLineDiscount } from '../../schema/mutations/pos/apply-line-discount.js';
import { resolveApplyTicketDiscount } from '../../schema/mutations/pos/apply-ticket-discount.js';
import { resolveCloseTicket } from '../../schema/mutations/pos/close-ticket.js';
import { resolveFireTicketItem } from '../../schema/mutations/pos/fire-ticket-item.js';
import { resolveMarkTicketItemReady } from '../../schema/mutations/pos/mark-ticket-item-ready.js';
import { resolveMarkTicketItemServed } from '../../schema/mutations/pos/mark-ticket-item-served.js';
import { resolveOpenTicket } from '../../schema/mutations/pos/open-ticket.js';
import { resolveReopenTicket } from '../../schema/mutations/pos/reopen-ticket.js';
import { resolveTicketById } from '../../schema/ticket.js';
import { resolveVoidTicketItem } from '../../schema/mutations/pos/void-ticket-item.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

interface PosFixtures {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  ownerUserId: string;
  staffUserId: string;
  managerUserId: string;
  adminUserId: string;
  taxCategoryId: string;
  categoryId: string;
  latteId: string;
  sizeGroupId: string;
  sizeSmallId: string;
  sizeMediumId: string;
  sizeLargeId: string;
}

async function seedPosFixtures(
  prisma: PrismaClient,
  opts: { tenantSlug?: string } = {},
): Promise<PosFixtures> {
  const slug = opts.tenantSlug ?? 'pos-tenant';
  const tenant = await prisma.tenant.create({
    data: { name: `Tenant ${slug}`, slug },
  });
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Mission St',
      slug: `${slug}-main`,
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      businessDayCutoff: '04:00',
    },
  });
  const mkUser = async (email: string, name: string) =>
    prisma.user.create({
      data: {
        email,
        name,
        passwordHash: hashPassword('password1'),
        emailVerified: new Date(),
      },
    });
  const owner = await mkUser(`owner-${slug}@t.test`, 'Owner');
  const admin = await mkUser(`admin-${slug}@t.test`, 'Admin');
  const manager = await mkUser(`mgr-${slug}@t.test`, 'Manager');
  const staff = await mkUser(`staff-${slug}@t.test`, 'Staff');

  const mkMembership = (
    userId: string,
    role: Role,
    locationId: string | null = null,
  ) =>
    prisma.membership.create({
      data: { userId, tenantId: tenant.id, role, locationId, status: 'ACTIVE' },
    });
  await mkMembership(owner.id, 'OWNER');
  await mkMembership(admin.id, 'ADMIN');
  await mkMembership(manager.id, 'MANAGER', location.id);
  await mkMembership(staff.id, 'STAFF', location.id);

  const taxCategory = await prisma.taxCategory.create({
    data: { tenantId: tenant.id, name: 'Food', kind: 'FOOD' },
  });
  await prisma.taxRate.create({
    data: {
      taxCategoryId: taxCategory.id,
      locationId: location.id,
      ratePermille: 825,
      effectiveFrom: new Date(Date.now() - 60 * 60 * 1000),
    },
  });
  const category = await prisma.category.create({
    data: { tenantId: tenant.id, name: 'Drinks', slug: `${slug}-drinks` },
  });
  const sizeGroup = await prisma.modifierGroup.create({
    data: {
      tenantId: tenant.id,
      name: 'Size',
      minSelections: 1,
      maxSelections: 1,
    },
  });
  const small = await prisma.modifier.create({
    data: { modifierGroupId: sizeGroup.id, name: 'Small', priceDeltaCents: 0, sortOrder: 0 },
  });
  const medium = await prisma.modifier.create({
    data: { modifierGroupId: sizeGroup.id, name: 'Medium', priceDeltaCents: 75, sortOrder: 1 },
  });
  const large = await prisma.modifier.create({
    data: { modifierGroupId: sizeGroup.id, name: 'Large', priceDeltaCents: 150, sortOrder: 2 },
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
  await prisma.menuItemModifierGroup.create({
    data: { menuItemId: latte.id, modifierGroupId: sizeGroup.id, sortOrder: 0 },
  });

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    locationId: location.id,
    ownerUserId: owner.id,
    staffUserId: staff.id,
    managerUserId: manager.id,
    adminUserId: admin.id,
    taxCategoryId: taxCategory.id,
    categoryId: category.id,
    latteId: latte.id,
    sizeGroupId: sizeGroup.id,
    sizeSmallId: small.id,
    sizeMediumId: medium.id,
    sizeLargeId: large.id,
  };
}

function ctxFor(args: {
  prisma: PrismaClient;
  fixtures: PosFixtures;
  userId: string;
  role: Role;
  withLocation?: boolean;
}): RequestContext {
  const auth: AuthContext = {
    kind: 'authenticated',
    user: { id: args.userId, email: 'u@test' },
    tenant: { id: args.fixtures.tenantId, slug: args.fixtures.tenantSlug },
    location:
      args.withLocation === false
        ? null
        : {
            id: args.fixtures.locationId,
            timezone: 'America/Los_Angeles',
            currency: 'USD',
          },
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

let F: PosFixtures;
type PublishSpy = ReturnType<typeof vi.fn>;
let publishSpy: PublishSpy;
let originalPublish: typeof pubsub.publish;

beforeEach(async () => {
  await truncateAll(prisma);
  F = await seedPosFixtures(prisma);
  // Replace pubsub.publish with a mock so we can assert on calls without
  // hitting an unconnected Postgres LISTEN/NOTIFY socket.
  publishSpy = vi.fn().mockResolvedValue(undefined);
  originalPublish = pubsub.publish.bind(pubsub);
  (pubsub as unknown as { publish: PublishSpy }).publish = publishSpy;
});

afterEach(() => {
  // Restore the real publish so cross-test side-effects don't leak.
  (pubsub as unknown as { publish: typeof pubsub.publish }).publish =
    originalPublish;
});

describe('POS integration suite (Testcontainers)', () => {
  it('1. open → add → fire → ready → served → close happy path with totals', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    // Open
    const ticket = (await resolveOpenTicket(
      {},
      { customerLabel: 'Sarah', orderType: 'DINE_IN' },
      staffCtx,
    )) as { id: string };
    const opened = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(opened.status).toBe('OPEN');
    expect(opened.shortNumber).toBe(1);

    // Add a Latte at Medium size — unitPrice 450, modifier 75, qty 1 → line 525.
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeMediumId }],
      },
      staffCtx,
    )) as { id: string };

    const afterAdd = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(afterAdd.subtotalCents).toBe(525);

    // Fire
    await resolveFireTicketItem({}, { ticketItemId: item.id }, staffCtx);
    expect(
      (await prisma.ticketItem.findUniqueOrThrow({ where: { id: item.id } }))
        .status,
    ).toBe('FIRED');

    // Mark ready
    await resolveMarkTicketItemReady({}, { ticketItemId: item.id }, staffCtx);
    expect(
      (await prisma.ticketItem.findUniqueOrThrow({ where: { id: item.id } }))
        .status,
    ).toBe('READY');

    // Mark served
    await resolveMarkTicketItemServed({}, { ticketItemId: item.id }, staffCtx);
    expect(
      (await prisma.ticketItem.findUniqueOrThrow({ where: { id: item.id } }))
        .status,
    ).toBe('SERVED');

    // Close — applies tax. 525 cents * 825 permille / 10000 = 43.31 → 43 (rounded).
    await resolveCloseTicket(
      {},
      { ticketId: ticket.id, closeNote: 'all good' },
      staffCtx,
    );
    const closed = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(closed.status).toBe('CLOSED');
    expect(closed.subtotalCents).toBe(525);
    expect(closed.discountCents).toBe(0);
    expect(closed.taxCents).toBe(Math.round((525 * 825) / 10_000));
    expect(closed.totalCents).toBe(525 + closed.taxCents);
    expect(closed.closeNote).toBe('all good');
  });

  it('2. cross-tenant isolation: tenant A staff cannot read tenant B tickets', async () => {
    const B = await seedPosFixtures(prisma, { tenantSlug: 'pos-tenant-b' });
    const aStaffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const bStaffCtx = ctxFor({
      prisma,
      fixtures: B,
      userId: B.staffUserId,
      role: 'STAFF',
    });
    const bTicket = (await resolveOpenTicket({}, {}, bStaffCtx)) as {
      id: string;
    };
    // Tenant A staff's location filter is location A; querying B's ticket
    // returns null even though we have its id.
    const got = await resolveTicketById({}, aStaffCtx, bTicket.id);
    expect(got).toBeNull();
    // Mutating it across tenants is also rejected (NotFoundError surfaces as
    // "Ticket not found" by the resolver).
    await expect(
      resolveAddTicketItem(
        {},
        { ticketId: bTicket.id, menuItemId: F.latteId },
        aStaffCtx,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('3. cross-location isolation: staff at location A cannot operate on location B tickets', async () => {
    // Create a second location in the same tenant.
    const locB = await prisma.location.create({
      data: {
        tenantId: F.tenantId,
        name: 'Outpost',
        slug: 'pos-tenant-outpost',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        businessDayCutoff: '04:00',
      },
    });
    // Open a ticket "at locB" by directly creating it; it is bound to locB.
    const businessDay = new Date('2026-01-01T00:00:00.000Z');
    const otherTicket = await prisma.ticket.create({
      data: {
        locationId: locB.id,
        shortNumber: 1,
        businessDay,
        orderType: 'DINE_IN',
        status: 'OPEN',
        openedById: F.staffUserId,
      },
    });
    const aStaffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    // resolveTicketById is location-scoped → null even though the id is real.
    expect(await resolveTicketById({}, aStaffCtx, otherTicket.id)).toBeNull();
    // Mutations also reject.
    await expect(
      resolveCloseTicket({}, { ticketId: otherTicket.id }, aStaffCtx),
    ).rejects.toThrow(/not found/i);
  });

  it('4. addTicketItem rejects when a required-1 modifier group has no selection', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    await expect(
      resolveAddTicketItem(
        {},
        { ticketId: ticket.id, menuItemId: F.latteId, modifiers: [] },
        staffCtx,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('5. snapshot pricing: basePrice updates after add do not change line price', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    // Bump the menu price out from under the live ticket.
    await prisma.menuItem.update({
      where: { id: F.latteId },
      data: { basePriceCents: 600 },
    });
    const stored = await prisma.ticketItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(stored.unitPriceCents).toBe(450);
    expect(stored.lineSubtotalCents).toBe(450);
  });

  it('6. shortNumber resets per business day and increments within a day', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const t1 = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const t2 = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const t3 = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const rows = await prisma.ticket.findMany({
      where: { id: { in: [t1.id, t2.id, t3.id] } },
      orderBy: { shortNumber: 'asc' },
    });
    expect(rows.map((r) => r.shortNumber)).toEqual([1, 2, 3]);

    // Manually bump three rows into a different businessDay (yesterday).
    const yday = new Date(rows[0]!.businessDay.getTime() - 24 * 60 * 60 * 1000);
    await prisma.ticket.create({
      data: {
        locationId: F.locationId,
        shortNumber: 1,
        businessDay: yday,
        orderType: 'DINE_IN',
        status: 'CLOSED',
        openedById: F.staffUserId,
      },
    });
    await prisma.ticket.create({
      data: {
        locationId: F.locationId,
        shortNumber: 2,
        businessDay: yday,
        orderType: 'DINE_IN',
        status: 'CLOSED',
        openedById: F.staffUserId,
      },
    });
    // The next ticket today is shortNumber 4 (yesterday's 1+2 don't collide).
    const t4 = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const t4Row = await prisma.ticket.findUniqueOrThrow({ where: { id: t4.id } });
    expect(t4Row.shortNumber).toBe(4);
    expect(t4Row.businessDay.getTime()).toBe(rows[0]!.businessDay.getTime());
  });

  it('7. discount math: $5 line FLAT + 10% PERCENT ticket on a $20 line', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    // Set Latte to a $20 base by bumping pre-add (no modifiers needed).
    await prisma.menuItem.update({
      where: { id: F.latteId },
      data: { basePriceCents: 2000 },
    });
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    // $5 line discount.
    await resolveApplyLineDiscount(
      {},
      {
        ticketItemId: item.id,
        kind: 'FLAT',
        amountCents: 500,
        reason: 'goodwill',
      },
      managerCtx,
    );
    // 10% ticket discount on subtotal-net-of-line-disc = $15 → $1.50.
    await resolveApplyTicketDiscount(
      {},
      {
        ticketId: ticket.id,
        kind: 'PERCENT',
        percentBp: 1000,
        reason: 'comp',
      },
      managerCtx,
    );
    const finalT = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(finalT.subtotalCents).toBe(2000);
    expect(finalT.discountCents).toBe(500 + 150);
    expect(finalT.taxCents).toBe(0); // live recompute uses tax=0
    expect(finalT.totalCents).toBe(2000 - 650);
  });

  it('8. discount manager-scope gate: staff is rejected; manager succeeds', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    );
    await expect(
      resolveApplyTicketDiscount(
        {},
        {
          ticketId: ticket.id,
          kind: 'PERCENT',
          percentBp: 1000,
          reason: 'try',
        },
        staffCtx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Manager succeeds.
    const created = (await resolveApplyTicketDiscount(
      {},
      {
        ticketId: ticket.id,
        kind: 'PERCENT',
        percentBp: 1000,
        reason: 'okay',
      },
      managerCtx,
    )) as { id: string };
    expect(created.id).toBeTruthy();
  });

  it('9. voided line is excluded from subtotal totals', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    // Add two items: Latte Small (450) and Latte Medium (525). Subtotal=975.
    const a = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeMediumId }],
      },
      staffCtx,
    );
    // Void the first.
    await resolveVoidTicketItem(
      {},
      { ticketItemId: a.id, voidReason: 'mistake' },
      staffCtx,
    );
    const t = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(t.subtotalCents).toBe(525);
  });

  it('10. tax math at close — $20 line at 8.25% → 165 cents tax, 2165 total', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    await prisma.menuItem.update({
      where: { id: F.latteId },
      data: { basePriceCents: 2000 },
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    await resolveFireTicketItem({}, { ticketItemId: item.id }, staffCtx);
    await resolveMarkTicketItemReady({}, { ticketItemId: item.id }, staffCtx);
    await resolveMarkTicketItemServed({}, { ticketItemId: item.id }, staffCtx);
    await resolveCloseTicket({}, { ticketId: ticket.id }, staffCtx);
    const t = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(t.subtotalCents).toBe(2000);
    expect(t.taxCents).toBe(165);
    expect(t.totalCents).toBe(2165);
  });

  it('11. canCloseTicket enforcement — close with FIRED items throws ConflictError', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    // Try to close with item still NEW — should reject.
    await expect(
      resolveCloseTicket({}, { ticketId: ticket.id }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
    // Fire → still rejects.
    await resolveFireTicketItem({}, { ticketItemId: item.id }, staffCtx);
    await expect(
      resolveCloseTicket({}, { ticketId: ticket.id }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('12. reopen flips a CLOSED ticket back to OPEN with audit rows', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    await resolveFireTicketItem({}, { ticketItemId: item.id }, staffCtx);
    await resolveMarkTicketItemReady({}, { ticketItemId: item.id }, staffCtx);
    await resolveMarkTicketItemServed({}, { ticketItemId: item.id }, staffCtx);
    await resolveCloseTicket(
      {},
      { ticketId: ticket.id, closeNote: 'closed' },
      staffCtx,
    );
    const closed = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(closed.status).toBe('CLOSED');
    expect(closed.closeNote).toBe('closed');

    await resolveReopenTicket({}, { ticketId: ticket.id }, managerCtx);
    const reopened = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(reopened.status).toBe('OPEN');
    expect(reopened.closeNote).toBeNull();
    expect(reopened.closedAt).toBeNull();
    expect(reopened.closedById).toBeNull();
    // Audit rows: ticket.closed and ticket.reopened both present.
    const audits = await prisma.auditLog.findMany({
      where: { resourceId: ticket.id, resourceType: 'ticket' },
    });
    expect(audits.some((a) => a.action === 'ticket.closed')).toBe(true);
    expect(audits.some((a) => a.action === 'ticket.reopened')).toBe(true);
  });

  it('13. subscription emit — every relevant mutation publishes on the location channel', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const channel = ticketChannelName(F.locationId);
    publishSpy.mockClear();
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TicketChanged',
      ticketId: ticket.id,
    });
    publishSpy.mockClear();
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    // addTicketItem publishes both TicketItemChanged + TicketChanged.
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TicketItemChanged',
      ticketId: ticket.id,
      ticketItemId: item.id,
    });
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TicketChanged',
      ticketId: ticket.id,
    });
  });

  it('14. audit codes: each mutation invoked writes exactly one row with the documented action', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const ticket = (await resolveOpenTicket({}, {}, staffCtx)) as { id: string };
    const item = (await resolveAddTicketItem(
      {},
      {
        ticketId: ticket.id,
        menuItemId: F.latteId,
        modifiers: [{ modifierId: F.sizeSmallId }],
      },
      staffCtx,
    )) as { id: string };
    await resolveFireTicketItem({}, { ticketItemId: item.id }, staffCtx);
    await resolveMarkTicketItemReady({}, { ticketItemId: item.id }, staffCtx);
    await resolveMarkTicketItemServed({}, { ticketItemId: item.id }, staffCtx);
    const lineDiscount = (await resolveApplyLineDiscount(
      {},
      {
        ticketItemId: item.id,
        kind: 'FLAT',
        amountCents: 50,
        reason: 'comp',
      },
      managerCtx,
    )) as { id: string };
    const ticketDiscount = (await resolveApplyTicketDiscount(
      {},
      {
        ticketId: ticket.id,
        kind: 'PERCENT',
        percentBp: 500,
        reason: 'loyal',
      },
      managerCtx,
    )) as { id: string };
    await resolveCloseTicket(
      {},
      { ticketId: ticket.id, closeNote: 'done' },
      staffCtx,
    );
    await resolveReopenTicket({}, { ticketId: ticket.id }, managerCtx);

    const expectExactlyOne = async (
      action: string,
      where: Record<string, unknown> = {},
    ) => {
      const rows = await prisma.auditLog.findMany({ where: { action, ...where } });
      expect(
        rows.length,
        `expected exactly one ${action} audit row, got ${rows.length}`,
      ).toBe(1);
    };

    await expectExactlyOne('ticket.opened', { resourceId: ticket.id });
    await expectExactlyOne('ticket_item.added', { resourceId: item.id });
    await expectExactlyOne('ticket_item.fired', { resourceId: item.id });
    await expectExactlyOne('ticket_item.marked_ready', { resourceId: item.id });
    await expectExactlyOne('ticket_item.marked_served', { resourceId: item.id });
    await expectExactlyOne('discount.line.applied', { resourceId: lineDiscount.id });
    await expectExactlyOne('discount.ticket.applied', {
      resourceId: ticketDiscount.id,
    });
    await expectExactlyOne('ticket.closed', { resourceId: ticket.id });
    await expectExactlyOne('ticket.reopened', { resourceId: ticket.id });
  });
});
