import { fromZonedTime } from 'date-fns-tz';
import type { RequestContext } from '../context.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { builder } from './builder.js';
import { ShiftStatusEnum } from './enums.js';

export type ShiftRow = {
  id: string;
  locationId: string;
  userId: string;
  jobRoleId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  notes: string | null;
  createdById: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

/** Pure: minutes between startsAt and endsAt, floored to int. */
export function computeShiftDurationMinutes(s: { startsAt: Date; endsAt: Date }): number {
  return Math.max(0, Math.floor((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000));
}

/**
 * Pure: compute the half-open [start, end) UTC window covering 7 local days
 * starting at midnight on `weekStart`'s YYYY-MM-DD in `timezone`.
 */
export function computeWeekRange(
  weekStart: Date,
  timezone: string,
): { start: Date; end: Date } {
  // Build a YYYY-MM-DD using the year/month/day fields of the input date as
  // interpreted in the same timezone — date-fns-tz provides formatInTimeZone
  // for this, but to keep the helper pure for tests we use ISO-derived parts.
  // Pothos passes the calendar Date as a `Date` at local-midnight UTC; the
  // simplest contract: treat `weekStart` as the UTC instant the caller wants
  // to anchor on, then derive its YYYY-MM-DD in `timezone`.
  const yyyy = weekStart.toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
  });
  const mm = weekStart.toLocaleString('en-US', {
    timeZone: timezone,
    month: '2-digit',
  });
  const dd = weekStart.toLocaleString('en-US', {
    timeZone: timezone,
    day: '2-digit',
  });
  const start = fromZonedTime(`${yyyy}-${mm}-${dd}T00:00:00`, timezone);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Pure resolver for `Query.scheduleForWeek(weekStart)`. Manager scope. */
export async function resolveScheduleForWeek(
  query: object,
  ctx: RequestContext,
  weekStart: Date,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can view the schedule');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const { start, end } = computeWeekRange(weekStart, ctx.auth.location.timezone);
  return ctx.prisma.shift.findMany({
    ...query,
    where: {
      locationId: ctx.auth.location.id,
      startsAt: { gte: start, lt: end },
    },
    orderBy: [{ startsAt: 'asc' }, { userId: 'asc' }],
  });
}

/** Pure resolver for `Query.myShifts(from, to)`. Self-scope. */
export async function resolveMyShifts(
  query: object,
  ctx: RequestContext,
  from: Date | null | undefined,
  to: Date | null | undefined,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const where: Record<string, unknown> = {
    userId: ctx.auth.user.id,
    locationId: ctx.auth.location.id,
  };
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = from;
    if (to) range.lt = to;
    where.startsAt = range;
  }
  return ctx.prisma.shift.findMany({
    ...query,
    where,
    orderBy: { startsAt: 'asc' },
  });
}

/** Pure resolver for `Query.shift(id)`. Manager OR self if assigned. */
export async function resolveShiftById(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const row = (await ctx.prisma.shift.findFirst({
    ...query,
    where: { id, locationId: ctx.auth.location.id },
  })) as ShiftRow | null;
  if (!row) return null;
  const isSelf = row.userId === ctx.auth.user.id;
  if (!isSelf && !MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only the assignee or a manager can read this shift');
  }
  return row;
}

export const ShiftRef = builder.prismaObject('Shift', {
  fields: (t) => ({
    id: t.exposeID('id'),
    startsAt: t.expose('startsAt', { type: 'DateTime' }),
    endsAt: t.expose('endsAt', { type: 'DateTime' }),
    status: t.field({
      type: ShiftStatusEnum,
      resolve: (parent) => parent.status,
    }),
    notes: t.exposeString('notes', { nullable: true }),
    cancelReason: t.exposeString('cancelReason', { nullable: true }),
    cancelledAt: t.expose('cancelledAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    user: t.relation('user', { authScopes: { authenticated: true } }),
    jobRole: t.relation('jobRole', { authScopes: { authenticated: true } }),
    location: t.relation('location', { authScopes: { authenticated: true } }),
    createdBy: t.relation('createdBy', { authScopes: { manager: true } }),
    durationMinutes: t.field({
      type: 'Int',
      resolve: (parent) =>
        computeShiftDurationMinutes(parent as { startsAt: Date; endsAt: Date }),
    }),
  }),
});

builder.queryField('scheduleForWeek', (t) =>
  t.prismaField({
    type: ['Shift'],
    description:
      "Shifts at the viewer's location whose startsAt falls in the 7-day window beginning at local midnight on weekStart. Manager scope.",
    authScopes: { manager: true },
    args: { weekStart: t.arg({ type: 'DateTime', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveScheduleForWeek(query, ctx, args.weekStart as Date) as never,
  }),
);

builder.queryField('myShifts', (t) =>
  t.prismaField({
    type: ['Shift'],
    description:
      "Shifts assigned to the viewer at the viewer's location, optionally filtered by [from, to). Self scope.",
    authScopes: { authenticated: true },
    args: {
      from: t.arg({ type: 'DateTime', required: false }),
      to: t.arg({ type: 'DateTime', required: false }),
    },
    resolve: (query, _root, args, ctx) =>
      resolveMyShifts(
        query,
        ctx,
        args.from as Date | null | undefined,
        args.to as Date | null | undefined,
      ) as never,
  }),
);

builder.queryField('shift', (t) =>
  t.prismaField({
    type: 'Shift',
    nullable: true,
    description:
      "Single shift by id, scoped to the viewer's location. Manager, or self if assigned.",
    authScopes: { authenticated: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveShiftById(query, ctx, args.id as string) as never,
  }),
);

// Re-export NotFoundError so co-located mutations can reference it without
// re-importing from the shared errors module.
export { NotFoundError };
