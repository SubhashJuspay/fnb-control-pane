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

import { clearCache } from '../../cache.js';
import type { AuthContext, RequestContext } from '../../context.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import { hashPassword } from '../../password.js';
import { TokenBucket } from '../../online-orders/rate-limit.js';
import { hashTrackingToken } from '../../online-orders/tracking-token.js';
import {
  onlineOrdersChannelName,
  pubsub,
} from '../../pubsub.js';
import { resolveTrackOnlineOrder } from '../../schema/online-order-request.js';
import { resolveConfirmOnlineOrder } from '../../schema/mutations/online-orders/confirm-online-order.js';
import { resolveRejectOnlineOrder } from '../../schema/mutations/online-orders/reject-online-order.js';
import {
  resolveSubmitOnlineOrder,
  type SubmitOnlineOrderArgs,
  type SubmitOnlineOrderDeps,
} from '../../schema/mutations/online-orders/submit-online-order.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

interface OnlineFixtures {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  locationSlug: string;
  staffUserId: string;
  managerUserId: string;
  taxCategoryId: string;
  categoryId: string;
  latteId: string;
  croissantId: string;
  archivedItemId: string;
  sizeGroupId: string;
  mediumModId: string;
  largeModId: string;
}

async function seedOnlineOrderFixtures(
  prisma: PrismaClient,
  opts: { tenantSlug?: string; locationSlug?: string } = {},
): Promise<OnlineFixtures> {
  const tenantSlug = opts.tenantSlug ?? 'oo-tenant';
  const locationSlug = opts.locationSlug ?? `${tenantSlug}-main`;
  const tenant = await prisma.tenant.create({
    data: { name: `Tenant ${tenantSlug}`, slug: tenantSlug },
  });
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Mission St',
      slug: locationSlug,
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
  const staff = await mkUser(`staff-${tenantSlug}@t.test`, 'Staff');
  const manager = await mkUser(`mgr-${tenantSlug}@t.test`, 'Manager');
  const mkMembership = (
    userId: string,
    role: Role,
    locationId: string | null = null,
  ) =>
    prisma.membership.create({
      data: { userId, tenantId: tenant.id, role, locationId, status: 'ACTIVE' },
    });
  await mkMembership(staff.id, 'STAFF', location.id);
  await mkMembership(manager.id, 'MANAGER', location.id);

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
    data: { tenantId: tenant.id, name: 'Drinks', slug: `${tenantSlug}-drinks` },
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
  const archived = await prisma.menuItem.create({
    data: {
      tenantId: tenant.id,
      taxCategoryId: taxCategory.id,
      categoryId: category.id,
      name: 'Old Donut',
      basePriceCents: 300,
      archivedAt: new Date(),
    },
  });

  // Required Size group attached to Latte (min=1, max=1).
  const sizeGroup = await prisma.modifierGroup.create({
    data: {
      tenantId: tenant.id,
      name: 'Size',
      minSelections: 1,
      maxSelections: 1,
    },
  });
  const medium = await prisma.modifier.create({
    data: { modifierGroupId: sizeGroup.id, name: 'Medium', priceDeltaCents: 0 },
  });
  const large = await prisma.modifier.create({
    data: {
      modifierGroupId: sizeGroup.id,
      name: 'Large',
      priceDeltaCents: 50,
    },
  });
  await prisma.menuItemModifierGroup.create({
    data: { menuItemId: latte.id, modifierGroupId: sizeGroup.id, sortOrder: 0 },
  });

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    locationId: location.id,
    locationSlug,
    staffUserId: staff.id,
    managerUserId: manager.id,
    taxCategoryId: taxCategory.id,
    categoryId: category.id,
    latteId: latte.id,
    croissantId: croissant.id,
    archivedItemId: archived.id,
    sizeGroupId: sizeGroup.id,
    mediumModId: medium.id,
    largeModId: large.id,
  };
}

function ctxFor(args: {
  prisma: PrismaClient;
  fixtures: OnlineFixtures;
  userId: string;
  role: Role;
}): RequestContext {
  const auth: AuthContext = {
    kind: 'authenticated',
    user: { id: args.userId, email: 'u@t' },
    tenant: { id: args.fixtures.tenantId, slug: args.fixtures.tenantSlug },
    location: {
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

function anonymousCtx(prisma: PrismaClient): RequestContext {
  return {
    auth: { kind: 'anonymous' },
    prisma: prisma as unknown as RequestContext['prisma'],
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

let F: OnlineFixtures;
type PublishSpy = ReturnType<typeof vi.fn>;
let publishSpy: PublishSpy;
let originalPublish: typeof pubsub.publish;
let testDeps: SubmitOnlineOrderDeps;

beforeEach(async () => {
  await truncateAll(prisma);
  clearCache();
  F = await seedOnlineOrderFixtures(prisma);
  publishSpy = vi.fn().mockResolvedValue(undefined);
  originalPublish = pubsub.publish.bind(pubsub);
  (pubsub as unknown as { publish: PublishSpy }).publish = publishSpy;
  testDeps = {
    rateLimiter: new TokenBucket({ capacity: 10, refillPerSec: 0.166 }),
    pubsub: { publish: publishSpy as unknown as typeof pubsub.publish },
    now: () => new Date(),
  };
});

afterEach(() => {
  (pubsub as unknown as { publish: typeof pubsub.publish }).publish =
    originalPublish;
});

function happyPathInput(): SubmitOnlineOrderArgs {
  return {
    tenantSlug: F.tenantSlug,
    locationSlug: F.locationSlug,
    customerName: 'Bob',
    customerPhone: '(555) 555-1234',
    pickupKind: 'ASAP',
    items: [
      { menuItemId: F.latteId, quantity: 1, modifiers: [F.mediumModId] },
    ],
    ipAddress: '127.0.0.1',
  };
}

describe('Online Orders integration suite', () => {
  it('1. submitOnlineOrder happy path: ticket created, items NEW, Guest auto-linked', async () => {
    const out = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    expect(out.trackingToken).toBeTruthy();
    expect(out.shortNumber).toBe(1);

    const requests = await prisma.onlineOrderRequest.findMany();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.confirmStatus).toBe('PENDING');

    const ticket = await prisma.ticket.findUnique({
      where: { id: requests[0]!.ticketId },
      select: { originChannel: true, orderType: true, customerLabel: true, guestId: true },
    });
    expect(ticket?.originChannel).toBe('ONLINE');
    expect(ticket?.orderType).toBe('TAKEOUT');
    expect(ticket?.customerLabel).toBe('Bob');
    expect(ticket?.guestId).toBeTruthy();

    const items = await prisma.ticketItem.findMany({
      where: { ticketId: requests[0]!.ticketId },
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('NEW');

    const guests = await prisma.guest.findMany({ where: { tenantId: F.tenantId } });
    expect(guests).toHaveLength(1);
    expect(guests[0]!.name).toBe('Bob');
  });

  it('2. Re-submission with same phone reuses existing Guest', async () => {
    await resolveSubmitOnlineOrder(happyPathInput(), anonymousCtx(prisma), testDeps);
    await resolveSubmitOnlineOrder(
      { ...happyPathInput(), customerName: 'Alice' },
      anonymousCtx(prisma),
      testDeps,
    );
    const guests = await prisma.guest.findMany({ where: { tenantId: F.tenantId } });
    expect(guests).toHaveLength(1);
    const tickets = await prisma.ticket.findMany();
    expect(tickets).toHaveLength(2);
    expect(tickets.every((t) => t.guestId === guests[0]!.id)).toBe(true);
  });

  it('3. submitOnlineOrder with archived item → ConflictError', async () => {
    const input: SubmitOnlineOrderArgs = {
      ...happyPathInput(),
      items: [{ menuItemId: F.archivedItemId, quantity: 1 }],
    };
    await expect(
      resolveSubmitOnlineOrder(input, anonymousCtx(prisma), testDeps),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('4. submitOnlineOrder rate-limited per IP after capacity', async () => {
    // Tiny bucket — capacity 2.
    const limited: SubmitOnlineOrderDeps = {
      rateLimiter: new TokenBucket({ capacity: 2, refillPerSec: 0 }),
      pubsub: { publish: publishSpy as unknown as typeof pubsub.publish },
      now: () => new Date(),
    };
    await resolveSubmitOnlineOrder(happyPathInput(), anonymousCtx(prisma), limited);
    await resolveSubmitOnlineOrder(happyPathInput(), anonymousCtx(prisma), limited);
    await expect(
      resolveSubmitOnlineOrder(happyPathInput(), anonymousCtx(prisma), limited),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('5. confirmOnlineOrder fires NEW items', async () => {
    const out = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    const request = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { trackingTokenHash: hashTrackingToken(out.trackingToken) },
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    await resolveConfirmOnlineOrder({}, { id: request.id }, staffCtx);
    const updated = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(updated.confirmStatus).toBe('CONFIRMED');
    expect(updated.confirmedById).toBe(F.staffUserId);
    const items = await prisma.ticketItem.findMany({
      where: { ticketId: request.ticketId },
    });
    expect(items.every((i) => i.status === 'FIRED')).toBe(true);
  });

  it('6. rejectOnlineOrder voids ticket + items', async () => {
    const out = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    const request = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { trackingTokenHash: hashTrackingToken(out.trackingToken) },
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    await resolveRejectOnlineOrder(
      {},
      { id: request.id, rejectReason: 'kitchen closed' },
      managerCtx,
    );
    const updated = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(updated.confirmStatus).toBe('REJECTED');
    expect(updated.rejectReason).toBe('kitchen closed');
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: request.ticketId },
    });
    expect(ticket.status).toBe('VOIDED');
    const items = await prisma.ticketItem.findMany({
      where: { ticketId: request.ticketId },
    });
    expect(items.every((i) => i.status === 'VOIDED')).toBe(true);
  });

  it('7. trackOnlineOrder returns sanitized projection; unknown token → null', async () => {
    const out = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    const tracking = await resolveTrackOnlineOrder(prisma, out.trackingToken);
    expect(tracking).not.toBeNull();
    expect(tracking?.customerName).toBe('Bob');
    expect(tracking?.confirmStatus).toBe('PENDING');
    expect(tracking?.ticketStatus).toBe('OPEN');

    const unknown = await resolveTrackOnlineOrder(prisma, 'x'.repeat(64));
    expect(unknown).toBeNull();
  });

  it('8. Cross-tenant + cross-location isolation', async () => {
    const other = await seedOnlineOrderFixtures(prisma, {
      tenantSlug: 'oo-other',
      locationSlug: 'oo-other-main',
    });
    // Submit at first tenant, then list at the other — must not see it.
    await resolveSubmitOnlineOrder(happyPathInput(), anonymousCtx(prisma), testDeps);
    const requests = await prisma.onlineOrderRequest.findMany({
      where: { locationId: other.locationId },
    });
    expect(requests).toHaveLength(0);

    // Confirm against wrong tenant context fails (NotFoundError because location-scoped).
    const allRequests = await prisma.onlineOrderRequest.findMany();
    expect(allRequests).toHaveLength(1);
    const otherStaffMembership = await prisma.user.create({
      data: { email: 'cross@t.test', name: 'X' },
    });
    await prisma.membership.create({
      data: {
        userId: otherStaffMembership.id,
        tenantId: other.tenantId,
        role: 'STAFF',
        locationId: other.locationId,
        status: 'ACTIVE',
      },
    });
    const otherStaffCtx = ctxFor({
      prisma,
      fixtures: other,
      userId: otherStaffMembership.id,
      role: 'STAFF',
    });
    await expect(
      resolveConfirmOnlineOrder({}, { id: allRequests[0]!.id }, otherStaffCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('9. Subscription channel emits on submit + confirm + reject', async () => {
    const submitOut = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    const channel = onlineOrdersChannelName(F.locationId);
    const submittedCalls = publishSpy.mock.calls.filter(
      (c) => c[0] === channel,
    );
    expect(submittedCalls).toHaveLength(1);
    expect((submittedCalls[0]![1] as { kind: string }).kind).toBe(
      'OnlineOrderRequestCreated',
    );

    const request = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { trackingTokenHash: hashTrackingToken(submitOut.trackingToken) },
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    await resolveConfirmOnlineOrder({}, { id: request.id }, staffCtx);
    const afterConfirm = publishSpy.mock.calls.filter((c) => c[0] === channel);
    expect(afterConfirm.length).toBeGreaterThanOrEqual(2);
    expect((afterConfirm[1]![1] as { kind: string }).kind).toBe(
      'OnlineOrderRequestUpdated',
    );

    // New request to test reject flow.
    const second = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    const secondReq = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { trackingTokenHash: hashTrackingToken(second.trackingToken) },
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    await resolveRejectOnlineOrder(
      {},
      { id: secondReq.id, rejectReason: 'closed' },
      managerCtx,
    );
    const afterReject = publishSpy.mock.calls.filter((c) => c[0] === channel);
    expect(afterReject.length).toBeGreaterThanOrEqual(4);
    expect((afterReject.at(-1)![1] as { kind: string }).kind).toBe(
      'OnlineOrderRequestUpdated',
    );
  });

  it('10. Audit codes per spec section 4.9', async () => {
    const out = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    const submitted = await prisma.auditLog.findMany({
      where: { action: 'online_order.submitted' },
    });
    expect(submitted).toHaveLength(1);

    const request = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { trackingTokenHash: hashTrackingToken(out.trackingToken) },
    });
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    await resolveConfirmOnlineOrder({}, { id: request.id }, staffCtx);
    const confirmed = await prisma.auditLog.findMany({
      where: { action: 'online_order.confirmed' },
    });
    expect(confirmed).toHaveLength(1);

    const second = await resolveSubmitOnlineOrder(
      happyPathInput(),
      anonymousCtx(prisma),
      testDeps,
    );
    const secondReq = await prisma.onlineOrderRequest.findUniqueOrThrow({
      where: { trackingTokenHash: hashTrackingToken(second.trackingToken) },
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    await resolveRejectOnlineOrder(
      {},
      { id: secondReq.id, rejectReason: 'X' },
      managerCtx,
    );
    const rejected = await prisma.auditLog.findMany({
      where: { action: 'online_order.rejected' },
    });
    expect(rejected).toHaveLength(1);
  });
});
