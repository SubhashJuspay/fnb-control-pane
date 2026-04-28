import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { computePunchedMinutes } from '../scheduling/time-entry.js';
import { builder } from './builder.js';

export type TimeEntryRow = {
  id: string;
  locationId: string;
  userId: string;
  shiftId: string | null;
  clockedInAt: Date;
  clockedOutAt: Date | null;
  totalBreakMinutes: number;
  manualEdit: boolean;
  manualEditReason: string | null;
  manualEditById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BreakRow = {
  id: string;
  timeEntryId: string;
  startedAt: Date;
  endedAt: Date | null;
};

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export interface TimeEntriesFilterArgs {
  fromDate?: Date | null;
  toDate?: Date | null;
  userId?: string | null;
}

/** Build a Prisma where clause for `Query.timeEntries`, scoped to a location. */
export function buildTimeEntriesWhere(
  locationId: string,
  filter: TimeEntriesFilterArgs | null | undefined,
): Record<string, unknown> {
  const where: Record<string, unknown> = { locationId };
  if (filter?.userId) where.userId = filter.userId;
  if (filter?.fromDate || filter?.toDate) {
    const range: Record<string, Date> = {};
    if (filter.fromDate) range.gte = filter.fromDate;
    if (filter.toDate) range.lte = filter.toDate;
    where.clockedInAt = range;
  }
  return where;
}

/** Pure resolver for `Query.myActiveTimeEntry`. */
export async function resolveMyActiveTimeEntry(
  query: object,
  ctx: RequestContext,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.timeEntry.findFirst({
    ...query,
    where: {
      userId: ctx.auth.user.id,
      locationId: ctx.auth.location.id,
      clockedOutAt: null,
    },
    orderBy: { clockedInAt: 'desc' },
  });
}

/** Pure resolver for `Query.timeEntries(filter)`. Manager scope. */
export async function resolveTimeEntries(
  query: object,
  ctx: RequestContext,
  filter: TimeEntriesFilterArgs | null | undefined,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can list time entries');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const where = buildTimeEntriesWhere(ctx.auth.location.id, filter);
  return ctx.prisma.timeEntry.findMany({
    ...query,
    where,
    orderBy: { clockedInAt: 'desc' },
  });
}

export const BreakRef = builder.prismaObject('Break', {
  fields: (t) => ({
    id: t.exposeID('id'),
    startedAt: t.expose('startedAt', { type: 'DateTime' }),
    endedAt: t.expose('endedAt', { type: 'DateTime', nullable: true }),
  }),
});

export const TimeEntryRef = builder.prismaObject('TimeEntry', {
  fields: (t) => ({
    id: t.exposeID('id'),
    clockedInAt: t.expose('clockedInAt', { type: 'DateTime' }),
    clockedOutAt: t.expose('clockedOutAt', { type: 'DateTime', nullable: true }),
    totalBreakMinutes: t.exposeInt('totalBreakMinutes'),
    manualEdit: t.exposeBoolean('manualEdit'),
    manualEditReason: t.exposeString('manualEditReason', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    user: t.relation('user', { authScopes: { authenticated: true } }),
    location: t.relation('location', { authScopes: { authenticated: true } }),
    shift: t.relation('shift', {
      authScopes: { authenticated: true },
      nullable: true,
    }),
    breaks: t.relation('breaks', {
      authScopes: { authenticated: true },
      query: { orderBy: { startedAt: 'asc' } },
    }),
    manualEditBy: t.relation('manualEditBy', {
      authScopes: { manager: true },
      nullable: true,
    }),
    netMinutes: t.field({
      type: 'Int',
      resolve: (parent) => {
        const row = parent as TimeEntryRow;
        return computePunchedMinutes({
          clockedInAt: row.clockedInAt,
          clockedOutAt: row.clockedOutAt,
          totalBreakMinutes: row.totalBreakMinutes,
          now: new Date(),
        });
      },
    }),
  }),
});

const TimeEntriesFilterInput = builder.inputType('TimeEntriesFilter', {
  fields: (t) => ({
    fromDate: t.field({ type: 'DateTime', required: false }),
    toDate: t.field({ type: 'DateTime', required: false }),
    userId: t.field({ type: 'UUID', required: false }),
  }),
});

builder.queryField('myActiveTimeEntry', (t) =>
  t.prismaField({
    type: 'TimeEntry',
    nullable: true,
    description:
      'The viewer current open punch — TimeEntry with clockedOutAt IS NULL — or null when not punched in.',
    authScopes: { authenticated: true },
    resolve: (query, _root, _args, ctx) =>
      resolveMyActiveTimeEntry(query, ctx) as never,
  }),
);

builder.queryField('timeEntries', (t) =>
  t.prismaField({
    type: ['TimeEntry'],
    description:
      "Time entries at the viewer's location, ordered by clockedInAt desc. Manager scope.",
    authScopes: { manager: true },
    args: { filter: t.arg({ type: TimeEntriesFilterInput, required: false }) },
    resolve: (query, _root, args, ctx) =>
      resolveTimeEntries(
        query,
        ctx,
        args.filter as TimeEntriesFilterArgs | null | undefined,
      ) as never,
  }),
);
