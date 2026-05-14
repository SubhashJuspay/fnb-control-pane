import { dateRangeSchema, topItemsSortSchema } from '@repo/validation/analytics';
import { z } from 'zod';
import {
  computeDayOfWeekMix,
  type DayOfWeekBucket as DayOfWeekBucketShape,
  type DayOfWeek as DayOfWeekShape,
} from '../analytics/day-of-week-mix.js';
import { computeGuestCohort, type GuestCohortRow } from '../analytics/cohort.js';
import { resolveBusinessDayRange } from '../analytics/date-range.js';
import {
  computeHourlyMix,
  type HourlyBucket as HourlyBucketShape,
} from '../analytics/hourly-mix.js';
import {
  computeServerPerformance,
  type ServerPerfRow,
} from '../analytics/servers.js';
import {
  computeLaborCost,
  type LaborCostSummary,
  type LaborStaffRow,
} from '../analytics/labor-cost.js';
import { computeSalesSummary, type SalesSummaryRow } from '../analytics/summary.js';
import {
  computeTopItems,
  type TopItemRow,
  type TopItemsSortBy,
} from '../analytics/top-items.js';
import { withTtlCache } from '../cache.js';
import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { DayOfWeekEnum } from './enums.js';

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];
const ANALYTICS_TTL_MS = 60_000;

interface DateRangeArgs {
  from: Date;
  to: Date;
}

interface AnalyticsContext {
  locationId: string;
  timezone: string;
  cutoff: string;
  fromUtc: Date;
  toUtc: Date;
  fromDate: Date;
  toDate: Date;
}

async function ensureManager(ctx: RequestContext): Promise<{
  locationId: string;
}> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can view analytics');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return { locationId: ctx.auth.location.id };
}

async function getAnalyticsContext(
  ctx: RequestContext,
  range: DateRangeArgs,
): Promise<AnalyticsContext> {
  const { locationId } = await ensureManager(ctx);
  const location = await ctx.prisma.location.findUnique({
    where: { id: locationId },
    select: { timezone: true, businessDayCutoff: true },
  });
  if (!location) throw new ForbiddenError('Location not found');
  const { fromUtc, toUtc } = resolveBusinessDayRange({
    from: range.from,
    to: range.to,
    timezone: location.timezone,
    businessDayCutoff: location.businessDayCutoff,
  });
  return {
    locationId,
    timezone: location.timezone,
    cutoff: location.businessDayCutoff,
    fromUtc,
    toUtc,
    fromDate: range.from,
    toDate: range.to,
  };
}

function rangeKey(range: DateRangeArgs): string {
  return `${range.from.toISOString()}:${range.to.toISOString()}`;
}

// ─── Pure resolvers ────────────────────────────────────────────────

export async function resolveSalesSummary(
  ctx: RequestContext,
  range: DateRangeArgs,
): Promise<SalesSummaryRow & { fromDate: Date; toDate: Date }> {
  const ac = await getAnalyticsContext(ctx, range);
  const key = `analytics:${ac.locationId}:salesSummary:${rangeKey(range)}`;
  const result = await withTtlCache(key, ANALYTICS_TTL_MS, async () => {
    const tickets = await ctx.prisma.ticket.findMany({
      where: {
        locationId: ac.locationId,
        closedAt: { gte: ac.fromUtc, lt: ac.toUtc },
      },
      select: {
        status: true,
        subtotalCents: true,
        discountCents: true,
        taxCents: true,
        totalCents: true,
        tipCents: true,
        refundCents: true,
        guestId: true,
      },
    });
    return computeSalesSummary({ tickets });
  });
  return { ...result, fromDate: ac.fromDate, toDate: ac.toDate };
}

export async function resolveTopItems(
  ctx: RequestContext,
  range: DateRangeArgs,
  limit: number,
  by: TopItemsSortBy,
): Promise<TopItemRow[]> {
  const ac = await getAnalyticsContext(ctx, range);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const key = `analytics:${ac.locationId}:topItems:${rangeKey(range)}:${safeLimit}:${by}`;
  return withTtlCache(key, ANALYTICS_TTL_MS, async () => {
    const items = (await ctx.prisma.ticketItem.findMany({
      where: {
        ticket: {
          locationId: ac.locationId,
          status: 'CLOSED',
          closedAt: { gte: ac.fromUtc, lt: ac.toUtc },
        },
      },
      select: {
        ticketId: true,
        menuItemId: true,
        nameSnapshot: true,
        quantity: true,
        lineSubtotalCents: true,
        status: true,
        menuItem: { select: { name: true } },
        discounts: {
          where: { voidedAt: null },
          select: { computedCents: true },
        },
      },
    })) as Array<{
      ticketId: string;
      menuItemId: string;
      nameSnapshot: string;
      quantity: number;
      lineSubtotalCents: number;
      status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
      menuItem: { name: string };
      discounts: Array<{ computedCents: number }>;
    }>;

    const lines = items.map((it) => ({
      menuItemId: it.menuItemId,
      menuItemName: it.menuItem?.name ?? it.nameSnapshot,
      quantity: it.quantity,
      lineSubtotalCents: it.lineSubtotalCents,
      lineDiscountCents: it.discounts.reduce((sum, d) => sum + d.computedCents, 0),
      ticketId: it.ticketId,
      status: it.status,
    }));
    return computeTopItems({ lines, limit: safeLimit, by });
  });
}

export async function resolveHourlyMix(
  ctx: RequestContext,
  range: DateRangeArgs,
): Promise<HourlyBucketShape[]> {
  const ac = await getAnalyticsContext(ctx, range);
  const key = `analytics:${ac.locationId}:hourlyMix:${rangeKey(range)}`;
  return withTtlCache(key, ANALYTICS_TTL_MS, async () => {
    const tickets = await ctx.prisma.ticket.findMany({
      where: {
        locationId: ac.locationId,
        status: 'CLOSED',
        closedAt: { gte: ac.fromUtc, lt: ac.toUtc },
      },
      select: { closedAt: true, totalCents: true },
    });
    return computeHourlyMix({ tickets, timezone: ac.timezone });
  });
}

export async function resolveDayOfWeekMix(
  ctx: RequestContext,
  range: DateRangeArgs,
): Promise<DayOfWeekBucketShape[]> {
  const ac = await getAnalyticsContext(ctx, range);
  const key = `analytics:${ac.locationId}:dayOfWeekMix:${rangeKey(range)}`;
  return withTtlCache(key, ANALYTICS_TTL_MS, async () => {
    const tickets = await ctx.prisma.ticket.findMany({
      where: {
        locationId: ac.locationId,
        status: 'CLOSED',
        closedAt: { gte: ac.fromUtc, lt: ac.toUtc },
      },
      select: { closedAt: true, totalCents: true },
    });
    return computeDayOfWeekMix({ tickets, timezone: ac.timezone });
  });
}

export async function resolveServerPerformance(
  ctx: RequestContext,
  range: DateRangeArgs,
): Promise<ServerPerfRow[]> {
  const ac = await getAnalyticsContext(ctx, range);
  const key = `analytics:${ac.locationId}:serverPerformance:${rangeKey(range)}`;
  return withTtlCache(key, ANALYTICS_TTL_MS, async () => {
    const rows = (await ctx.prisma.ticket.findMany({
      where: {
        locationId: ac.locationId,
        closedAt: { gte: ac.fromUtc, lt: ac.toUtc },
      },
      select: {
        openedById: true,
        totalCents: true,
        status: true,
        openedBy: { select: { name: true, email: true } },
        items: { select: { status: true, servedById: true } },
      },
    })) as Array<{
      openedById: string;
      totalCents: number;
      status: 'OPEN' | 'CLOSED' | 'VOIDED';
      openedBy: { name: string | null; email: string };
      items: Array<{
        status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
        servedById: string | null;
      }>;
    }>;

    const tickets = rows.map((r) => ({
      openedById: r.openedById,
      openedByName: r.openedBy?.name ?? r.openedBy?.email ?? r.openedById,
      totalCents: r.totalCents,
      status: r.status,
      items: r.items,
    }));
    return computeServerPerformance({ tickets });
  });
}

export async function resolveGuestCohort(
  ctx: RequestContext,
  range: DateRangeArgs,
): Promise<GuestCohortRow & { fromDate: Date; toDate: Date }> {
  const ac = await getAnalyticsContext(ctx, range);
  const key = `analytics:${ac.locationId}:guestCohort:${rangeKey(range)}`;
  const result = await withTtlCache(key, ANALYTICS_TTL_MS, async () => {
    const tickets = (await ctx.prisma.ticket.findMany({
      where: {
        locationId: ac.locationId,
        status: 'CLOSED',
        closedAt: { not: null },
        guestId: { not: null },
      },
      select: { guestId: true, closedAt: true },
    })) as Array<{ guestId: string | null; closedAt: Date | null }>;

    const visits = tickets
      .filter(
        (t): t is { guestId: string; closedAt: Date } =>
          t.guestId !== null && t.closedAt !== null,
      )
      .map((t) => ({ guestId: t.guestId, ticketClosedAt: t.closedAt }));

    return computeGuestCohort({
      guestVisits: visits,
      range: { from: ac.fromUtc, to: ac.toUtc },
    });
  });
  return { ...result, fromDate: ac.fromDate, toDate: ac.toDate };
}

// ─── GraphQL types ──────────────────────────────────────────────────

export const DateRangeInput = builder.inputType('DateRangeInput', {
  fields: (t) => ({
    from: t.field({ type: 'DateTime', required: true }),
    to: t.field({ type: 'DateTime', required: true }),
  }),
});

export const TopItemsSortEnum = builder.enumType('TopItemsSort', {
  values: ['QUANTITY', 'REVENUE', 'TICKETS'] as const,
});

interface SalesSummaryShape extends SalesSummaryRow {
  fromDate: Date;
  toDate: Date;
}

const SalesSummaryRef = builder.objectRef<SalesSummaryShape>('SalesSummary');
SalesSummaryRef.implement({
  description: 'Aggregated sales summary over a date range.',
  fields: (t) => ({
    fromDate: t.expose('fromDate', { type: 'DateTime' }),
    toDate: t.expose('toDate', { type: 'DateTime' }),
    ticketCount: t.exposeInt('ticketCount'),
    closedTicketCount: t.exposeInt('closedTicketCount'),
    voidedTicketCount: t.exposeInt('voidedTicketCount'),
    grossSalesCents: t.exposeInt('grossSalesCents'),
    discountCents: t.exposeInt('discountCents'),
    taxCents: t.exposeInt('taxCents'),
    netSalesCents: t.exposeInt('netSalesCents'),
    tipCents: t.exposeInt('tipCents'),
    refundCents: t.exposeInt('refundCents'),
    averageTicketCents: t.exposeInt('averageTicketCents'),
    uniqueGuests: t.exposeInt('uniqueGuests'),
  }),
});

const TopItemRefType = builder.objectRef<TopItemRow>('TopItem');
TopItemRefType.implement({
  description: 'Top-selling item over a date range.',
  fields: (t) => ({
    menuItemId: t.exposeID('menuItemId'),
    menuItemName: t.exposeString('menuItemName'),
    quantitySold: t.exposeInt('quantitySold'),
    revenueCents: t.exposeInt('revenueCents'),
    ticketCount: t.exposeInt('ticketCount'),
  }),
});

const HourlyBucketRef = builder.objectRef<HourlyBucketShape>('HourlyBucket');
HourlyBucketRef.implement({
  description: 'Aggregated revenue and ticket count for a single hour-of-day bucket.',
  fields: (t) => ({
    hour: t.exposeInt('hour'),
    ticketCount: t.exposeInt('ticketCount'),
    revenueCents: t.exposeInt('revenueCents'),
  }),
});

const DayOfWeekBucketRef = builder.objectRef<DayOfWeekBucketShape>('DayOfWeekBucket');
DayOfWeekBucketRef.implement({
  description: 'Aggregated revenue and ticket count for a single day-of-week bucket.',
  fields: (t) => ({
    dayOfWeek: t.field({
      type: DayOfWeekEnum,
      resolve: (parent) => parent.dayOfWeek as DayOfWeekShape,
    }),
    ticketCount: t.exposeInt('ticketCount'),
    revenueCents: t.exposeInt('revenueCents'),
  }),
});

const ServerPerformanceRef = builder.objectRef<ServerPerfRow>('ServerPerformance');
ServerPerformanceRef.implement({
  description: 'Per-server performance summary over a date range.',
  fields: (t) => ({
    openedById: t.exposeID('openedById'),
    openedByName: t.exposeString('openedByName'),
    ticketCount: t.exposeInt('ticketCount'),
    itemsServed: t.exposeInt('itemsServed'),
    revenueCents: t.exposeInt('revenueCents'),
    averageTicketCents: t.exposeInt('averageTicketCents'),
    voidRate: t.exposeFloat('voidRate'),
  }),
});

interface GuestCohortShape extends GuestCohortRow {
  fromDate: Date;
  toDate: Date;
}

const GuestCohortRef = builder.objectRef<GuestCohortShape>('GuestCohort');
GuestCohortRef.implement({
  description: 'New vs returning guest counts over a date range.',
  fields: (t) => ({
    fromDate: t.expose('fromDate', { type: 'DateTime' }),
    toDate: t.expose('toDate', { type: 'DateTime' }),
    newGuestCount: t.exposeInt('newGuestCount'),
    returningGuestCount: t.exposeInt('returningGuestCount'),
    repeatRate: t.exposeFloat('repeatRate'),
  }),
});

// ─── Query fields ───────────────────────────────────────────────────

builder.queryField('salesSummary', (t) =>
  t.field({
    type: SalesSummaryRef,
    description: 'Aggregated sales summary across closed/voided tickets in range.',
    authScopes: { manager: true },
    args: { dateRange: t.arg({ type: DateRangeInput, required: true }) },
    validate: { schema: z.object({ dateRange: dateRangeSchema }) },
    resolve: (_root, args, ctx) =>
      resolveSalesSummary(ctx, args.dateRange as DateRangeArgs),
  }),
);

builder.queryField('topItems', (t) =>
  t.field({
    type: [TopItemRefType],
    description: 'Top-selling menu items in range, sorted by `by`.',
    authScopes: { manager: true },
    args: {
      dateRange: t.arg({ type: DateRangeInput, required: true }),
      limit: t.arg({ type: 'Int', required: false, defaultValue: 10 }),
      by: t.arg({ type: TopItemsSortEnum, required: false, defaultValue: 'QUANTITY' }),
    },
    validate: {
      schema: z.object({
        dateRange: dateRangeSchema,
        limit: z.number().int().min(1).max(100).nullable().optional(),
        by: topItemsSortSchema.nullable().optional(),
      }),
    },
    resolve: (_root, args, ctx) =>
      resolveTopItems(
        ctx,
        args.dateRange as DateRangeArgs,
        (args.limit as number | null | undefined) ?? 10,
        (args.by as TopItemsSortBy | null | undefined) ?? 'QUANTITY',
      ),
  }),
);

builder.queryField('hourlyMix', (t) =>
  t.field({
    type: [HourlyBucketRef],
    description: '24-bucket hour-of-day mix (in location timezone) for closed tickets.',
    authScopes: { manager: true },
    args: { dateRange: t.arg({ type: DateRangeInput, required: true }) },
    validate: { schema: z.object({ dateRange: dateRangeSchema }) },
    resolve: (_root, args, ctx) =>
      resolveHourlyMix(ctx, args.dateRange as DateRangeArgs),
  }),
);

builder.queryField('dayOfWeekMix', (t) =>
  t.field({
    type: [DayOfWeekBucketRef],
    description: '7-bucket day-of-week mix (MON..SUN) for closed tickets.',
    authScopes: { manager: true },
    args: { dateRange: t.arg({ type: DateRangeInput, required: true }) },
    validate: { schema: z.object({ dateRange: dateRangeSchema }) },
    resolve: (_root, args, ctx) =>
      resolveDayOfWeekMix(ctx, args.dateRange as DateRangeArgs),
  }),
);

builder.queryField('serverPerformance', (t) =>
  t.field({
    type: [ServerPerformanceRef],
    description: 'Per-server performance leaderboard.',
    authScopes: { manager: true },
    args: { dateRange: t.arg({ type: DateRangeInput, required: true }) },
    validate: { schema: z.object({ dateRange: dateRangeSchema }) },
    resolve: (_root, args, ctx) =>
      resolveServerPerformance(ctx, args.dateRange as DateRangeArgs),
  }),
);

builder.queryField('guestCohort', (t) =>
  t.field({
    type: GuestCohortRef,
    description: 'New vs returning guest cohort over the date range.',
    authScopes: { manager: true },
    args: { dateRange: t.arg({ type: DateRangeInput, required: true }) },
    validate: { schema: z.object({ dateRange: dateRangeSchema }) },
    resolve: (_root, args, ctx) =>
      resolveGuestCohort(ctx, args.dateRange as DateRangeArgs),
  }),
);

// ─── Labor cost ─────────────────────────────────────────────────────

export async function resolveLaborCost(
  ctx: RequestContext,
  range: DateRangeArgs,
): Promise<LaborCostSummary> {
  const ac = await getAnalyticsContext(ctx, range);
  const key = `analytics:${ac.locationId}:laborCost:${rangeKey(range)}`;
  return withTtlCache(key, ANALYTICS_TTL_MS, async () => {
    // Sum revenue from closed tickets in the window. Mirrors the
    // salesSummary `netSalesCents` reference: revenue here is total minus
    // tax so labor-cost % aligns with the industry-standard formula.
    const ticketAgg = await ctx.prisma.ticket.aggregate({
      where: {
        locationId: ac.locationId,
        status: 'CLOSED',
        closedAt: { gte: ac.fromUtc, lt: ac.toUtc },
      },
      _sum: { totalCents: true, taxCents: true },
    });
    const revenueCents =
      (ticketAgg._sum.totalCents ?? 0) - (ticketAgg._sum.taxCents ?? 0);

    // Pull every TimeEntry that overlaps the window. Use clockedInAt for
    // window-overlap; entries that span the boundary are included whole —
    // the per-entry math then trims them to the entry's full clocked time.
    // (Trimming exactly to the window would mis-attribute labor that
    // started before but ended inside; the operational use case for this
    // report is "what did labor cost today" so whole entries that opened
    // today is the closer answer.)
    const entries = await ctx.prisma.timeEntry.findMany({
      where: {
        locationId: ac.locationId,
        clockedInAt: { gte: ac.fromUtc, lt: ac.toUtc },
      },
      select: {
        userId: true,
        clockedInAt: true,
        clockedOutAt: true,
        totalBreakMinutes: true,
        user: { select: { name: true, email: true } },
        shift: {
          select: { jobRole: { select: { name: true } } },
        },
      },
    });

    // Fold in the per-staff hourly rate from EmploymentProfile. One profile
    // per (user, location).
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const profiles = await ctx.prisma.employmentProfile.findMany({
      where: { locationId: ac.locationId, userId: { in: userIds } },
      select: { userId: true, hourlyRateCents: true },
    });
    const rateByUser = new Map<string, number | null>();
    for (const p of profiles)
      rateByUser.set(p.userId, p.hourlyRateCents ?? null);

    return computeLaborCost({
      revenueCents,
      entries: entries.map((e) => ({
        userId: e.userId,
        userName: e.user?.name ?? e.user?.email ?? e.userId,
        clockedInAt: e.clockedInAt,
        clockedOutAt: e.clockedOutAt,
        totalBreakMinutes: e.totalBreakMinutes,
        hourlyRateCents: rateByUser.get(e.userId) ?? null,
        jobRoleName: e.shift?.jobRole?.name ?? null,
      })),
    });
  });
}

const LaborStaffRowRef = builder.objectRef<LaborStaffRow>('LaborStaffRow');
LaborStaffRowRef.implement({
  description: 'Per-staff labor breakdown for the date range.',
  fields: (t) => ({
    userId: t.exposeID('userId'),
    userName: t.exposeString('userName'),
    jobRoleName: t.exposeString('jobRoleName', { nullable: true }),
    hours: t.exposeFloat('hours'),
    hourlyRateCents: t.exposeInt('hourlyRateCents', { nullable: true }),
    laborCostCents: t.exposeInt('laborCostCents'),
    shifts: t.exposeInt('shifts'),
  }),
});

const LaborCostRef = builder.objectRef<LaborCostSummary>('LaborCost');
LaborCostRef.implement({
  description:
    'Labor cost summary for a date range: total hours, total cost, revenue, and the labor-cost ratio (cost ÷ net-sales revenue).',
  fields: (t) => ({
    totalHours: t.exposeFloat('totalHours'),
    totalLaborCostCents: t.exposeInt('totalLaborCostCents'),
    revenueCents: t.exposeInt('revenueCents'),
    laborCostPct: t.exposeFloat('laborCostPct'),
    perStaff: t.field({ type: [LaborStaffRowRef], resolve: (p) => p.perStaff }),
  }),
});

builder.queryField('laborCost', (t) =>
  t.field({
    type: LaborCostRef,
    description:
      'Labor cost summary for the date range. Manager+ only. Includes per-staff hours + cost and the labor-cost percent of net sales.',
    authScopes: { manager: true },
    args: { dateRange: t.arg({ type: DateRangeInput, required: true }) },
    validate: { schema: z.object({ dateRange: dateRangeSchema }) },
    resolve: (_root, args, ctx) =>
      resolveLaborCost(ctx, args.dateRange as DateRangeArgs),
  }),
);
