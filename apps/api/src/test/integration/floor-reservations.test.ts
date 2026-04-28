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
import { floorChannelName, pubsub, ticketChannelName } from '../../pubsub.js';
import { resolveAddTicketItem } from '../../schema/mutations/pos/add-ticket-item.js';
import { resolveCloseTicket } from '../../schema/mutations/pos/close-ticket.js';
import { resolveFireTicketItem } from '../../schema/mutations/pos/fire-ticket-item.js';
import { resolveMarkTicketItemReady } from '../../schema/mutations/pos/mark-ticket-item-ready.js';
import { resolveMarkTicketItemServed } from '../../schema/mutations/pos/mark-ticket-item-served.js';
import { resolveAddWalkin } from '../../schema/mutations/reservations/add-walkin.js';
import { resolveCancelReservation } from '../../schema/mutations/reservations/cancel-reservation.js';
import { resolveConfirmReservation } from '../../schema/mutations/reservations/confirm-reservation.js';
import { resolveCreateReservation } from '../../schema/mutations/reservations/create-reservation.js';
import { resolveSeatReservation } from '../../schema/mutations/reservations/seat-reservation.js';
import { resolveAssignTableServer } from '../../schema/mutations/floor/assign-table-server.js';
import { resolveCreateSection } from '../../schema/mutations/floor/create-section.js';
import { resolveCreateTable } from '../../schema/mutations/floor/create-table.js';
import { resolveOpenTicketAtTable } from '../../schema/mutations/floor/open-ticket-at-table.js';
import { resolveSetTableManualState } from '../../schema/mutations/floor/set-table-manual-state.js';
import { resolveUpdateTable } from '../../schema/mutations/floor/update-table.js';
import { resolveTableState } from '../../schema/table.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

interface FloorFixtures {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  ownerUserId: string;
  staffUserId: string;
  managerUserId: string;
  taxCategoryId: string;
  categoryId: string;
  latteId: string;
  sectionId: string;
  tableAId: string;
  tableBId: string;
  tableCId: string;
}

async function seedFloorFixtures(
  prisma: PrismaClient,
  opts: { tenantSlug?: string } = {},
): Promise<FloorFixtures> {
  const slug = opts.tenantSlug ?? 'floor-tenant';
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
  await mkMembership(manager.id, 'MANAGER', location.id);
  await mkMembership(staff.id, 'STAFF', location.id);

  // Minimal POS fixtures — enough for opening a ticket and closing it.
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
  const latte = await prisma.menuItem.create({
    data: {
      tenantId: tenant.id,
      taxCategoryId: taxCategory.id,
      categoryId: category.id,
      name: 'Latte',
      basePriceCents: 450,
    },
  });

  const section = (await prisma.section.create({
    data: {
      locationId: location.id,
      name: 'Main',
      sortOrder: 0,
    },
  })) as { id: string };
  const tableA = (await prisma.table.create({
    data: {
      locationId: location.id,
      sectionId: section.id,
      label: 'T-1',
      capacity: 4,
      shape: 'RECT',
      positionX: 0,
      positionY: 0,
      width: 80,
      height: 80,
      rotation: 0,
    },
  })) as { id: string };
  const tableB = (await prisma.table.create({
    data: {
      locationId: location.id,
      sectionId: section.id,
      label: 'T-2',
      capacity: 2,
      shape: 'RECT',
      positionX: 100,
      positionY: 0,
      width: 60,
      height: 60,
      rotation: 0,
    },
  })) as { id: string };
  const tableC = (await prisma.table.create({
    data: {
      locationId: location.id,
      sectionId: section.id,
      label: 'T-3',
      capacity: 6,
      shape: 'CIRCLE',
      positionX: 200,
      positionY: 0,
      width: 100,
      height: 100,
      rotation: 0,
    },
  })) as { id: string };

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    locationId: location.id,
    ownerUserId: owner.id,
    staffUserId: staff.id,
    managerUserId: manager.id,
    taxCategoryId: taxCategory.id,
    categoryId: category.id,
    latteId: latte.id,
    sectionId: section.id,
    tableAId: tableA.id,
    tableBId: tableB.id,
    tableCId: tableC.id,
  };
}

function ctxFor(args: {
  prisma: PrismaClient;
  fixtures: FloorFixtures;
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

let F: FloorFixtures;
type PublishSpy = ReturnType<typeof vi.fn>;
let publishSpy: PublishSpy;
let originalPublish: typeof pubsub.publish;

beforeEach(async () => {
  await truncateAll(prisma);
  F = await seedFloorFixtures(prisma);
  publishSpy = vi.fn().mockResolvedValue(undefined);
  originalPublish = pubsub.publish.bind(pubsub);
  (pubsub as unknown as { publish: PublishSpy }).publish = publishSpy;
});

afterEach(() => {
  (pubsub as unknown as { publish: typeof pubsub.publish }).publish =
    originalPublish;
});

async function fullyCloseTicket(
  prisma: PrismaClient,
  ticketId: string,
  staffCtx: RequestContext,
  fixtures: FloorFixtures,
): Promise<void> {
  // Add an item, drive it through SERVED, then close.
  const item = (await resolveAddTicketItem(
    {},
    { ticketId, menuItemId: fixtures.latteId, modifiers: [] },
    staffCtx,
  )) as { id: string };
  await resolveFireTicketItem({}, { ticketItemId: item.id }, staffCtx);
  await resolveMarkTicketItemReady({}, { ticketItemId: item.id }, staffCtx);
  await resolveMarkTicketItemServed({}, { ticketItemId: item.id }, staffCtx);
  await resolveCloseTicket({}, { ticketId }, staffCtx);
}

describe('Floor + Reservations integration suite (Testcontainers)', () => {
  it('1. fresh tables derive AVAILABLE state', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const tables = await prisma.table.findMany({
      where: { locationId: F.locationId },
      orderBy: { label: 'asc' },
    });
    expect(tables).toHaveLength(3);
    for (const t of tables) {
      const state = await resolveTableState(
        { id: t.id, manualState: t.manualState },
        staffCtx,
      );
      expect(state).toBe('AVAILABLE');
    }
  });

  it('2. openTicketAtTable → OCCUPIED; close ticket → AVAILABLE', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const ticket = (await resolveOpenTicketAtTable(
      {},
      { tableId: F.tableAId, customerLabel: 'Walk-in' },
      staffCtx,
    )) as { id: string };
    let state = await resolveTableState(
      { id: F.tableAId, manualState: 'NONE' },
      staffCtx,
    );
    expect(state).toBe('OCCUPIED');

    await fullyCloseTicket(prisma, ticket.id, staffCtx, F);
    state = await resolveTableState(
      { id: F.tableAId, manualState: 'NONE' },
      staffCtx,
    );
    expect(state).toBe('AVAILABLE');
  });

  it('3. seatReservation opens ticket, links reservation, table is OCCUPIED', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const r = (await resolveCreateReservation(
      {},
      {
        guestName: 'John',
        partySize: 4,
        requestedTime: new Date(Date.now() + 30 * 60 * 1000),
        durationMinutes: 90,
        tableId: F.tableAId,
      },
      managerCtx,
    )) as { id: string };
    await resolveConfirmReservation({}, { id: r.id }, managerCtx);
    const seated = await resolveSeatReservation(
      { reservationId: r.id },
      staffCtx,
    );
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(reservation.status).toBe('SEATED');
    expect(reservation.ticketId).toBe(seated.ticketId);
    expect(reservation.tableId).toBe(F.tableAId);
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: seated.ticketId },
    });
    expect(ticket.tableId).toBe(F.tableAId);
    expect(ticket.status).toBe('OPEN');
    const state = await resolveTableState(
      { id: F.tableAId, manualState: 'NONE' },
      staffCtx,
    );
    expect(state).toBe('OCCUPIED');
  });

  it('4. cross-tenant + cross-location isolation: cannot see/mutate other tenants/locations', async () => {
    const B = await seedFloorFixtures(prisma, { tenantSlug: 'floor-tenant-b' });
    const aStaffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    // resolveTableState relies on `tableId` lookups — but the higher mutation layer
    // is what enforces location scoping. We assert via mutations.
    await expect(
      resolveOpenTicketAtTable(
        {},
        { tableId: B.tableAId },
        aStaffCtx,
      ),
    ).rejects.toThrow(/not found/i);
    // Also verify a second location in the same tenant: cross-location isolation.
    const locB = await prisma.location.create({
      data: {
        tenantId: F.tenantId,
        name: 'Outpost',
        slug: 'floor-tenant-outpost',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        businessDayCutoff: '04:00',
      },
    });
    const otherTable = (await prisma.table.create({
      data: {
        locationId: locB.id,
        label: 'OB-1',
        capacity: 4,
        shape: 'RECT',
        positionX: 0,
        positionY: 0,
      },
    })) as { id: string };
    await expect(
      resolveSetTableManualState(
        {},
        { tableId: otherTable.id, manualState: 'CLEANING' },
        aStaffCtx,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('5. walk-in flow: addWalkin → WAITING; seat → SEATED + ticket; close → COMPLETED', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const walkin = (await resolveAddWalkin(
      {},
      { guestName: 'Sarah', partySize: 2 },
      staffCtx,
    )) as { id: string };
    let r = await prisma.reservation.findUniqueOrThrow({
      where: { id: walkin.id },
    });
    expect(r.status).toBe('WAITING');
    expect(r.kind).toBe('WALKIN');
    expect(r.requestedTime).toBeNull();

    const seated = await resolveSeatReservation(
      { reservationId: walkin.id, tableId: F.tableBId },
      staffCtx,
    );
    r = await prisma.reservation.findUniqueOrThrow({ where: { id: walkin.id } });
    expect(r.status).toBe('SEATED');
    expect(r.tableId).toBe(F.tableBId);
    expect(r.ticketId).toBe(seated.ticketId);

    await fullyCloseTicket(prisma, seated.ticketId, staffCtx, F);
    r = await prisma.reservation.findUniqueOrThrow({ where: { id: walkin.id } });
    expect(r.status).toBe('COMPLETED');
    expect(r.completedAt).toBeInstanceOf(Date);
  });

  it('6. cancelReservation preserves cancelReason + cancelledAt', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const r = (await resolveCreateReservation(
      {},
      {
        guestName: 'Dana',
        partySize: 2,
        requestedTime: new Date(Date.now() + 90 * 60 * 1000),
      },
      managerCtx,
    )) as { id: string };
    await resolveCancelReservation(
      {},
      { id: r.id, cancelReason: 'guest called off' },
      managerCtx,
    );
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.cancelReason).toBe('guest called off');
    expect(after.cancelledAt).toBeInstanceOf(Date);
  });

  it('7. POS closeTicket auto-completes a SEATED linked reservation', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const r = (await resolveCreateReservation(
      {},
      {
        guestName: 'Linus',
        partySize: 3,
        requestedTime: new Date(Date.now() + 30 * 60 * 1000),
        tableId: F.tableCId,
      },
      managerCtx,
    )) as { id: string };
    await resolveConfirmReservation({}, { id: r.id }, managerCtx);
    const seated = await resolveSeatReservation(
      { reservationId: r.id },
      staffCtx,
    );
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } }))
        .status,
    ).toBe('SEATED');
    await fullyCloseTicket(prisma, seated.ticketId, staffCtx, F);
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.status).toBe('COMPLETED');
    expect(after.completedAt).toBeInstanceOf(Date);
  });

  it('8. subscription emit: every floor mutation publishes the right floor event(s)', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const floorChannel = floorChannelName(F.locationId);
    const ticketChannel = ticketChannelName(F.locationId);

    // createSection
    publishSpy.mockClear();
    const section = (await resolveCreateSection(
      {},
      { name: 'Patio' },
      managerCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'SectionChanged',
      sectionId: section.id,
    });

    // createTable
    publishSpy.mockClear();
    const newTable = (await resolveCreateTable(
      {},
      {
        label: 'Patio-1',
        sectionId: section.id,
        positionX: 50,
        positionY: 50,
        capacity: 4,
        shape: 'RECT',
      },
      managerCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'TableChanged',
      tableId: newTable.id,
    });

    // updateTable
    publishSpy.mockClear();
    await resolveUpdateTable({}, { id: newTable.id, capacity: 6 }, managerCtx);
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'TableChanged',
      tableId: newTable.id,
    });

    // setTableManualState
    publishSpy.mockClear();
    await resolveSetTableManualState(
      {},
      { tableId: F.tableAId, manualState: 'CLEANING' },
      staffCtx,
    );
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'TableChanged',
      tableId: F.tableAId,
    });

    // assignTableServer
    publishSpy.mockClear();
    await resolveAssignTableServer(
      {},
      { tableId: F.tableAId, assignedServerId: F.staffUserId },
      managerCtx,
    );
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'TableChanged',
      tableId: F.tableAId,
    });

    // openTicketAtTable publishes both TicketChanged + TableChanged
    publishSpy.mockClear();
    const ticket = (await resolveOpenTicketAtTable(
      {},
      { tableId: F.tableBId },
      staffCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(ticketChannel, {
      kind: 'TicketChanged',
      ticketId: ticket.id,
    });
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'TableChanged',
      tableId: F.tableBId,
    });

    // createReservation publishes ReservationChanged
    publishSpy.mockClear();
    const r = (await resolveCreateReservation(
      {},
      {
        guestName: 'X',
        partySize: 2,
        requestedTime: new Date(Date.now() + 60 * 60 * 1000),
      },
      managerCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'ReservationChanged',
      reservationId: r.id,
    });

    // confirm
    publishSpy.mockClear();
    await resolveConfirmReservation({}, { id: r.id }, managerCtx);
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'ReservationChanged',
      reservationId: r.id,
    });

    // addWalkin
    publishSpy.mockClear();
    const walkin = (await resolveAddWalkin(
      {},
      { guestName: 'W', partySize: 2 },
      staffCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'ReservationChanged',
      reservationId: walkin.id,
    });

    // cancel publishes ReservationChanged
    publishSpy.mockClear();
    await resolveCancelReservation({}, { id: r.id }, managerCtx);
    expect(publishSpy).toHaveBeenCalledWith(floorChannel, {
      kind: 'ReservationChanged',
      reservationId: r.id,
    });
  });

  it('9. audit codes: every documented floor/reservation action writes the right audit row', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    // Create a section and table for full audit coverage.
    const section = (await resolveCreateSection(
      {},
      { name: 'AuditSection' },
      managerCtx,
    )) as { id: string };
    const table = (await resolveCreateTable(
      {},
      {
        label: 'AT-1',
        positionX: 0,
        positionY: 0,
        capacity: 4,
        sectionId: section.id,
      },
      managerCtx,
    )) as { id: string };
    await resolveUpdateTable({}, { id: table.id, capacity: 5 }, managerCtx);
    await resolveAssignTableServer(
      {},
      { tableId: table.id, assignedServerId: F.staffUserId },
      managerCtx,
    );
    await resolveSetTableManualState(
      {},
      { tableId: table.id, manualState: 'CLEANING' },
      staffCtx,
    );
    // Walk-in flow
    const walkin = (await resolveAddWalkin(
      {},
      { guestName: 'W', partySize: 2 },
      staffCtx,
    )) as { id: string };
    // Reservation flow
    const r = (await resolveCreateReservation(
      {},
      {
        guestName: 'R',
        partySize: 2,
        requestedTime: new Date(Date.now() + 30 * 60 * 1000),
        tableId: F.tableAId,
      },
      managerCtx,
    )) as { id: string };
    await resolveConfirmReservation({}, { id: r.id }, managerCtx);
    const seated = await resolveSeatReservation(
      { reservationId: r.id },
      staffCtx,
    );
    // Cancel walk-in
    await resolveCancelReservation(
      {},
      { id: walkin.id, cancelReason: 'left' },
      managerCtx,
    );
    // Closing ticket triggers reservation auto-complete (no audit row from
    // reservation side — the post-close hook is silent — but ticket.closed is).
    await fullyCloseTicket(prisma, seated.ticketId, staffCtx, F);

    const expectAtLeastOne = async (
      action: string,
      where: Record<string, unknown> = {},
    ) => {
      const rows = await prisma.auditLog.findMany({ where: { action, ...where } });
      expect(
        rows.length,
        `expected at least one ${action} audit row, got ${rows.length}`,
      ).toBeGreaterThanOrEqual(1);
    };

    await expectAtLeastOne('section.created', { resourceId: section.id });
    await expectAtLeastOne('table.created', { resourceId: table.id });
    await expectAtLeastOne('table.updated', { resourceId: table.id });
    await expectAtLeastOne('table.server_assigned', { resourceId: table.id });
    await expectAtLeastOne('table.manual_state_set', { resourceId: table.id });
    await expectAtLeastOne('walkin.added', { resourceId: walkin.id });
    await expectAtLeastOne('reservation.created', { resourceId: r.id });
    await expectAtLeastOne('reservation.confirmed', { resourceId: r.id });
    await expectAtLeastOne('reservation.seated', { resourceId: r.id });
    await expectAtLeastOne('reservation.cancelled', { resourceId: walkin.id });
    await expectAtLeastOne('ticket.opened_at_table', {
      resourceId: seated.ticketId,
    });
  });

  it('10. RBAC: staff cannot create reservations (manager-scope mutation)', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    await expect(
      resolveCreateReservation(
        {},
        {
          guestName: 'X',
          partySize: 2,
          requestedTime: new Date(Date.now() + 30 * 60 * 1000),
        },
        staffCtx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('11. seatReservation with no resolvable tableId raises ConflictError', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const r = (await resolveCreateReservation(
      {},
      {
        guestName: 'NoTable',
        partySize: 2,
        requestedTime: new Date(Date.now() + 30 * 60 * 1000),
      },
      managerCtx,
    )) as { id: string };
    await resolveConfirmReservation({}, { id: r.id }, managerCtx);
    await expect(
      resolveSeatReservation({ reservationId: r.id }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
