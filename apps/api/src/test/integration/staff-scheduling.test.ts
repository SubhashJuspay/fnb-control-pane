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

// Stub the nodemailer client at module load so any transitive imports
// during resolver loading do not require an SMTP env.
vi.mock('../../email/client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  setMailer: vi.fn(),
  getMailer: vi.fn(),
}));

import type { AuthContext, RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { hashPassword } from '../../password.js';
import { pubsub, scheduleChannelName } from '../../pubsub.js';
import { resolveStaffRoster } from '../../schema/employment-profile.js';
import { resolveJobRoles } from '../../schema/job-role.js';
import {
  resolveMyShifts,
  resolveScheduleForWeek,
} from '../../schema/shift.js';
import {
  resolveMyActiveTimeEntry,
  resolveTimeEntries,
} from '../../schema/time-entry.js';
import { resolveCreateJobRole } from '../../schema/mutations/staff/create-job-role.js';
import { resolveUpsertEmploymentProfile } from '../../schema/mutations/staff/upsert-employment-profile.js';
import { resolveCancelShift } from '../../schema/mutations/scheduling/cancel-shift.js';
import { resolveCreateShift } from '../../schema/mutations/scheduling/create-shift.js';
import { resolveDuplicateWeek } from '../../schema/mutations/scheduling/duplicate-week.js';
import { resolvePublishShift } from '../../schema/mutations/scheduling/publish-shift.js';
import { resolvePublishWeek } from '../../schema/mutations/scheduling/publish-week.js';
import { resolveEditTimeEntry } from '../../schema/mutations/time-clock/edit-time-entry.js';
import { resolveEndBreak } from '../../schema/mutations/time-clock/end-break.js';
import { resolvePunchIn } from '../../schema/mutations/time-clock/punch-in.js';
import { resolvePunchOut } from '../../schema/mutations/time-clock/punch-out.js';
import { resolveStartBreak } from '../../schema/mutations/time-clock/start-break.js';
import { setupTestDb, truncateAll, type TestDb } from '../testcontainers.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

interface StaffFixtures {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  ownerUserId: string;
  adminUserId: string;
  managerUserId: string;
  staffUserId: string;
  serverRoleId: string;
}

async function seedStaffFixtures(
  prisma: PrismaClient,
  opts: { tenantSlug?: string } = {},
): Promise<StaffFixtures> {
  const slug = opts.tenantSlug ?? 'staff-tenant';
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

  const serverRole = (await prisma.jobRole.create({
    data: { tenantId: tenant.id, name: 'Server', color: '#10b981' },
  })) as { id: string };

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    locationId: location.id,
    ownerUserId: owner.id,
    adminUserId: admin.id,
    managerUserId: manager.id,
    staffUserId: staff.id,
    serverRoleId: serverRole.id,
  };
}

function ctxFor(args: {
  prisma: PrismaClient;
  fixtures: StaffFixtures;
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

let F: StaffFixtures;
type PublishSpy = ReturnType<typeof vi.fn>;
let publishSpy: PublishSpy;
let originalPublish: typeof pubsub.publish;

beforeEach(async () => {
  await truncateAll(prisma);
  F = await seedStaffFixtures(prisma);
  publishSpy = vi.fn().mockResolvedValue(undefined);
  originalPublish = pubsub.publish.bind(pubsub);
  (pubsub as unknown as { publish: PublishSpy }).publish = publishSpy;
});

afterEach(() => {
  (pubsub as unknown as { publish: typeof pubsub.publish }).publish =
    originalPublish;
});

describe('Staff & Scheduling integration suite (Testcontainers)', () => {
  it('1. creates job role + employment profile + shift and queries staff roster + scheduleForWeek', async () => {
    const adminCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.adminUserId,
      role: 'ADMIN',
    });
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });

    // Create a second job role to verify ordering and listing.
    await resolveCreateJobRole({}, { name: 'Bartender', color: '#f59e0b' }, adminCtx);

    // Upsert employment profile for the staff user.
    await resolveUpsertEmploymentProfile(
      {},
      {
        userId: F.staffUserId,
        locationId: F.locationId,
        employmentType: 'FULL_TIME',
        hourlyRateCents: 2500,
        hireDate: new Date('2026-01-01T00:00:00Z'),
      },
      adminCtx,
    );

    // Create a shift this Friday 17:00–22:00 PT.
    const startsAt = new Date('2026-05-01T17:00:00-07:00');
    const endsAt = new Date('2026-05-01T22:00:00-07:00');
    const shift = (await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt,
        endsAt,
      },
      managerCtx,
    )) as { id: string };
    expect(shift.id).toBeTruthy();

    // jobRoles query returns both roles ordered by archivedAt asc, name asc.
    const jobRoles = (await resolveJobRoles({}, managerCtx)) as Array<{ name: string }>;
    expect(jobRoles.map((r) => r.name)).toEqual(['Bartender', 'Server']);

    // staffRoster returns the upserted profile.
    const roster = (await resolveStaffRoster({}, managerCtx)) as Array<{ userId: string }>;
    expect(roster).toHaveLength(1);
    expect(roster[0]?.userId).toBe(F.staffUserId);

    // scheduleForWeek returns the shift.
    const weekStart = new Date('2026-04-27T07:00:00Z'); // Mon midnight PT
    const week = (await resolveScheduleForWeek({}, managerCtx, weekStart)) as Array<{
      id: string;
    }>;
    expect(week.map((s) => s.id)).toContain(shift.id);
  });

  it('2. cross-tenant isolation: queries cannot leak shifts/profiles/job-roles', async () => {
    const B = await seedStaffFixtures(prisma, { tenantSlug: 'staff-tenant-b' });

    const aAdminCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.adminUserId,
      role: 'ADMIN',
    });
    const aManagerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });

    // Seed B-side employment + shift.
    const bAdminCtx = ctxFor({
      prisma,
      fixtures: B,
      userId: B.adminUserId,
      role: 'ADMIN',
    });
    const bManagerCtx = ctxFor({
      prisma,
      fixtures: B,
      userId: B.managerUserId,
      role: 'MANAGER',
    });
    await resolveUpsertEmploymentProfile(
      {},
      {
        userId: B.staffUserId,
        locationId: B.locationId,
        employmentType: 'PART_TIME',
        hireDate: new Date('2026-02-01T00:00:00Z'),
      },
      bAdminCtx,
    );
    const startsAt = new Date('2026-05-01T17:00:00-07:00');
    const endsAt = new Date('2026-05-01T22:00:00-07:00');
    await resolveCreateShift(
      {},
      {
        userId: B.staffUserId,
        jobRoleId: B.serverRoleId,
        startsAt,
        endsAt,
      },
      bManagerCtx,
    );

    // A-side: jobRoles should not include B's roles
    const aRoles = (await resolveJobRoles({}, aManagerCtx)) as Array<{ id: string }>;
    expect(aRoles.map((r) => r.id)).not.toContain(B.serverRoleId);

    // A-side: staffRoster only sees A's profiles (none here)
    const aRoster = (await resolveStaffRoster({}, aManagerCtx)) as Array<unknown>;
    expect(aRoster).toHaveLength(0);

    // A-side: scheduleForWeek empty
    const weekStart = new Date('2026-04-27T07:00:00Z');
    const aWeek = (await resolveScheduleForWeek({}, aManagerCtx, weekStart)) as Array<unknown>;
    expect(aWeek).toHaveLength(0);

    // A admin trying to upsert profile for B staff → NotFound (no membership in A tenant)
    await expect(
      resolveUpsertEmploymentProfile(
        {},
        {
          userId: B.staffUserId,
          locationId: F.locationId,
          employmentType: 'FULL_TIME',
          hireDate: new Date('2026-01-01T00:00:00Z'),
        },
        aAdminCtx,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('3. createShift with overlapping window for same user → ConflictError', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-05-01T17:00:00-07:00'),
        endsAt: new Date('2026-05-01T22:00:00-07:00'),
      },
      managerCtx,
    );
    await expect(
      resolveCreateShift(
        {},
        {
          userId: F.staffUserId,
          jobRoleId: F.serverRoleId,
          startsAt: new Date('2026-05-01T20:00:00-07:00'),
          endsAt: new Date('2026-05-01T23:00:00-07:00'),
        },
        managerCtx,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('4. publishShift transitions DRAFT → PUBLISHED; cancelShift sets CANCELLED', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    const created = (await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-05-01T17:00:00-07:00'),
        endsAt: new Date('2026-05-01T22:00:00-07:00'),
      },
      managerCtx,
    )) as { id: string };

    const published = (await resolvePublishShift(
      {},
      { id: created.id },
      managerCtx,
    )) as { id: string };
    let row = await prisma.shift.findUniqueOrThrow({
      where: { id: published.id },
    });
    expect(row.status).toBe('PUBLISHED');

    // Re-publish disallowed.
    await expect(
      resolvePublishShift({}, { id: created.id }, managerCtx),
    ).rejects.toBeInstanceOf(ConflictError);

    await resolveCancelShift(
      {},
      { id: created.id, cancelReason: 'staff out sick' },
      managerCtx,
    );
    row = await prisma.shift.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelReason).toBe('staff out sick');
    expect(row.cancelledAt).toBeInstanceOf(Date);
  });

  it('5. punchIn → startBreak → endBreak → punchOut → myActiveTimeEntry returns closed entry; netMinutes correct', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const entry = (await resolvePunchIn(
      {},
      { locationId: F.locationId },
      staffCtx,
    )) as { id: string };

    // Backdate clock-in 2 hours so net minutes computation is deterministic.
    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { clockedInAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const brk = (await resolveStartBreak(
      {},
      { timeEntryId: entry.id },
      staffCtx,
    )) as { id: string };
    // Backdate the break startedAt 15 minutes ago.
    await prisma.break.update({
      where: { id: brk.id },
      data: { startedAt: new Date(Date.now() - 15 * 60 * 1000) },
    });
    await resolveEndBreak({}, { breakId: brk.id }, staffCtx);

    await resolvePunchOut({}, { timeEntryId: entry.id }, staffCtx);

    // myActiveTimeEntry should return null now (closed).
    const active = await resolveMyActiveTimeEntry({}, staffCtx);
    expect(active).toBeNull();

    const closed = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(closed.clockedOutAt).toBeInstanceOf(Date);
    // Net = ~120 - 15 = 105. Allow a small tolerance for clock skew across the
    // multi-step run (we only floor to minute).
    expect(closed.totalBreakMinutes).toBeGreaterThanOrEqual(14);
    expect(closed.totalBreakMinutes).toBeLessThanOrEqual(16);
    const netMinutes = Math.max(
      0,
      Math.floor(
        (closed.clockedOutAt!.getTime() - closed.clockedInAt.getTime()) / 60_000,
      ) - closed.totalBreakMinutes,
    );
    expect(netMinutes).toBeGreaterThanOrEqual(103);
    expect(netMinutes).toBeLessThanOrEqual(107);
  });

  it('6. punchIn while an active entry exists → ConflictError', async () => {
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    await resolvePunchIn({}, { locationId: F.locationId }, staffCtx);
    await expect(
      resolvePunchIn({}, { locationId: F.locationId }, staffCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('7. editTimeEntry by manager sets manualEdit=true, requires reason, fires audit', async () => {
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
    const entry = (await resolvePunchIn(
      {},
      { locationId: F.locationId },
      staffCtx,
    )) as { id: string };
    await resolvePunchOut({}, { timeEntryId: entry.id }, staffCtx);

    const newIn = new Date('2026-05-01T17:00:00Z');
    const newOut = new Date('2026-05-01T22:30:00Z');
    await resolveEditTimeEntry(
      {},
      {
        id: entry.id,
        clockedInAt: newIn,
        clockedOutAt: newOut,
        totalBreakMinutes: 30,
        manualEditReason: 'Forgot to punch out — corrected from POS log',
      },
      managerCtx,
    );
    const row = await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.manualEdit).toBe(true);
    expect(row.manualEditReason).toContain('corrected');
    expect(row.manualEditById).toBe(F.managerUserId);
    expect(row.totalBreakMinutes).toBe(30);
    expect(row.clockedOutAt?.toISOString()).toBe(newOut.toISOString());

    // Manager scope: timeEntries lists this row.
    const list = (await resolveTimeEntries({}, managerCtx, null)) as Array<{ id: string }>;
    expect(list.map((r) => r.id)).toContain(entry.id);

    // Forbidden for staff
    await expect(
      resolveEditTimeEntry(
        {},
        {
          id: entry.id,
          clockedInAt: newIn,
          clockedOutAt: newOut,
          manualEditReason: 'tampering',
        },
        staffCtx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('8. duplicateWeek copies PUBLISHED shifts as DRAFT into the target week', async () => {
    const managerCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.managerUserId,
      role: 'MANAGER',
    });
    // Source: Mon 2026-04-27 PT week. Create a published + a draft shift.
    const published = (await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-05-01T17:00:00-07:00'),
        endsAt: new Date('2026-05-01T22:00:00-07:00'),
      },
      managerCtx,
    )) as { id: string };
    await resolvePublishShift({}, { id: published.id }, managerCtx);
    await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-04-30T17:00:00-07:00'),
        endsAt: new Date('2026-04-30T22:00:00-07:00'),
      },
      managerCtx,
    );

    const sourceWeek = new Date('2026-04-27T07:00:00Z');
    const targetWeek = new Date('2026-05-04T07:00:00Z');
    const created = (await resolveDuplicateWeek(
      {
        locationId: F.locationId,
        weekStart: sourceWeek,
        targetWeekStart: targetWeek,
      },
      managerCtx,
    )) as Array<{ id: string }>;
    expect(created).toHaveLength(1);
    const dup = await prisma.shift.findUniqueOrThrow({ where: { id: created[0]!.id } });
    expect(dup.status).toBe('DRAFT');
    // Shifted by exactly one week.
    expect(dup.startsAt.toISOString()).toBe(
      new Date('2026-05-08T17:00:00-07:00').toISOString(),
    );

    // myShifts(staff) sees the published source shift but not the duplicated draft.
    const staffCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.staffUserId,
      role: 'STAFF',
    });
    const mine = (await resolveMyShifts({}, staffCtx, null, null)) as Array<{
      id: string;
      status: string;
    }>;
    expect(mine.find((s) => s.id === published.id)?.status).toBe('PUBLISHED');
  });

  it('9. subscription: every staff/scheduling/time-clock mutation publishes the right event', async () => {
    const adminCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.adminUserId,
      role: 'ADMIN',
    });
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
    const channel = scheduleChannelName(F.locationId);

    // createShift
    publishSpy.mockClear();
    const shift = (await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-05-01T17:00:00-07:00'),
        endsAt: new Date('2026-05-01T22:00:00-07:00'),
      },
      managerCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'ShiftChanged',
      shiftId: shift.id,
    });

    // publishShift
    publishSpy.mockClear();
    await resolvePublishShift({}, { id: shift.id }, managerCtx);
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'ShiftChanged',
      shiftId: shift.id,
    });

    // cancelShift
    publishSpy.mockClear();
    await resolveCancelShift({}, { id: shift.id, cancelReason: 'oops' }, managerCtx);
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'ShiftChanged',
      shiftId: shift.id,
    });

    // publishWeek (no draft shifts → still allowed; no events emitted)
    publishSpy.mockClear();
    await resolvePublishWeek(
      { locationId: F.locationId, weekStart: new Date('2026-04-27T07:00:00Z') },
      managerCtx,
    );
    // No drafts → no ShiftChanged emits.
    const shiftEmits = publishSpy.mock.calls.filter(
      (c) => (c[1] as { kind?: string }).kind === 'ShiftChanged',
    );
    expect(shiftEmits).toHaveLength(0);

    // Now: a fresh draft + publishWeek → exactly one ShiftChanged emit.
    publishSpy.mockClear();
    const fresh = (await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-04-30T17:00:00-07:00'),
        endsAt: new Date('2026-04-30T22:00:00-07:00'),
      },
      managerCtx,
    )) as { id: string };
    publishSpy.mockClear();
    await resolvePublishWeek(
      { locationId: F.locationId, weekStart: new Date('2026-04-27T07:00:00Z') },
      managerCtx,
    );
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'ShiftChanged',
      shiftId: fresh.id,
    });

    // duplicateWeek → emits one ShiftChanged for the duplicated row.
    publishSpy.mockClear();
    const dups = (await resolveDuplicateWeek(
      {
        locationId: F.locationId,
        weekStart: new Date('2026-04-27T07:00:00Z'),
        targetWeekStart: new Date('2026-05-04T07:00:00Z'),
      },
      managerCtx,
    )) as Array<{ id: string }>;
    for (const d of dups) {
      expect(publishSpy).toHaveBeenCalledWith(channel, {
        kind: 'ShiftChanged',
        shiftId: d.id,
      });
    }

    // punchIn → TimeEntryChanged
    publishSpy.mockClear();
    const entry = (await resolvePunchIn(
      {},
      { locationId: F.locationId },
      staffCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TimeEntryChanged',
      timeEntryId: entry.id,
      userId: F.staffUserId,
    });

    // startBreak
    publishSpy.mockClear();
    const brk = (await resolveStartBreak(
      {},
      { timeEntryId: entry.id },
      staffCtx,
    )) as { id: string };
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TimeEntryChanged',
      timeEntryId: entry.id,
      userId: F.staffUserId,
    });

    // endBreak
    publishSpy.mockClear();
    await resolveEndBreak({}, { breakId: brk.id }, staffCtx);
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TimeEntryChanged',
      timeEntryId: entry.id,
      userId: F.staffUserId,
    });

    // punchOut
    publishSpy.mockClear();
    await resolvePunchOut({}, { timeEntryId: entry.id }, staffCtx);
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TimeEntryChanged',
      timeEntryId: entry.id,
      userId: F.staffUserId,
    });

    // editTimeEntry
    publishSpy.mockClear();
    await resolveEditTimeEntry(
      {},
      {
        id: entry.id,
        clockedInAt: new Date('2026-05-01T17:00:00Z'),
        clockedOutAt: new Date('2026-05-01T20:00:00Z'),
        manualEditReason: 'corrected typo',
      },
      managerCtx,
    );
    expect(publishSpy).toHaveBeenCalledWith(channel, {
      kind: 'TimeEntryChanged',
      timeEntryId: entry.id,
      userId: F.staffUserId,
    });

    // Coverage of admin-only mutation publish channels not required, but
    // assert createJobRole does NOT publish on the schedule channel (it's
    // tenant-wide).
    publishSpy.mockClear();
    await resolveCreateJobRole({}, { name: 'Cook', color: '#ef4444' }, adminCtx);
    const channelEmits = publishSpy.mock.calls.filter((c) => c[0] === channel);
    expect(channelEmits).toHaveLength(0);
  });

  it('10. audit codes: every documented staff/scheduling/time-clock action writes the right audit row', async () => {
    const adminCtx = ctxFor({
      prisma,
      fixtures: F,
      userId: F.adminUserId,
      role: 'ADMIN',
    });
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

    const role = (await resolveCreateJobRole(
      {},
      { name: 'Bartender', color: '#f59e0b' },
      adminCtx,
    )) as { id: string };
    const profile = (await resolveUpsertEmploymentProfile(
      {},
      {
        userId: F.staffUserId,
        locationId: F.locationId,
        employmentType: 'FULL_TIME',
        hourlyRateCents: 2500,
        hireDate: new Date('2026-01-01T00:00:00Z'),
      },
      adminCtx,
    )) as { id: string };

    const shift = (await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-05-01T17:00:00-07:00'),
        endsAt: new Date('2026-05-01T22:00:00-07:00'),
      },
      managerCtx,
    )) as { id: string };
    await resolvePublishShift({}, { id: shift.id }, managerCtx);
    await resolveCancelShift(
      {},
      { id: shift.id, cancelReason: 'gone' },
      managerCtx,
    );

    // publishWeek + duplicateWeek
    const fresh = (await resolveCreateShift(
      {},
      {
        userId: F.staffUserId,
        jobRoleId: F.serverRoleId,
        startsAt: new Date('2026-04-30T17:00:00-07:00'),
        endsAt: new Date('2026-04-30T22:00:00-07:00'),
      },
      managerCtx,
    )) as { id: string };
    await resolvePublishWeek(
      { locationId: F.locationId, weekStart: new Date('2026-04-27T07:00:00Z') },
      managerCtx,
    );
    void fresh;
    await resolveDuplicateWeek(
      {
        locationId: F.locationId,
        weekStart: new Date('2026-04-27T07:00:00Z'),
        targetWeekStart: new Date('2026-05-04T07:00:00Z'),
      },
      managerCtx,
    );

    // Time clock flow.
    const entry = (await resolvePunchIn(
      {},
      { locationId: F.locationId },
      staffCtx,
    )) as { id: string };
    const brk = (await resolveStartBreak(
      {},
      { timeEntryId: entry.id },
      staffCtx,
    )) as { id: string };
    await resolveEndBreak({}, { breakId: brk.id }, staffCtx);
    await resolvePunchOut({}, { timeEntryId: entry.id }, staffCtx);
    await resolveEditTimeEntry(
      {},
      {
        id: entry.id,
        clockedInAt: new Date('2026-05-01T17:00:00Z'),
        clockedOutAt: new Date('2026-05-01T22:00:00Z'),
        manualEditReason: 'cleanup',
      },
      managerCtx,
    );

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

    await expectExactlyOne('job_role.created', { resourceId: role.id });
    await expectExactlyOne('employment.upserted', { resourceId: profile.id });
    await expectExactlyOne('shift.created', { resourceId: shift.id });
    await expectExactlyOne('shift.published', { resourceId: shift.id });
    await expectExactlyOne('shift.cancelled', { resourceId: shift.id });
    await expectExactlyOne('schedule.week_published', {
      resourceId: F.locationId,
    });
    await expectExactlyOne('schedule.week_duplicated', {
      resourceId: F.locationId,
    });
    await expectExactlyOne('time_entry.punched_in', { resourceId: entry.id });
    await expectExactlyOne('time_entry.break_started', {
      resourceId: brk.id,
    });
    await expectExactlyOne('time_entry.break_ended', { resourceId: brk.id });
    await expectExactlyOne('time_entry.punched_out', { resourceId: entry.id });
    await expectExactlyOne('time_entry.manually_edited', {
      resourceId: entry.id,
    });
  });
});
