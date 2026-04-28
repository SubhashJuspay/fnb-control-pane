import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { DayOfWeekEnum } from './enums.js';

export type AvailabilityWindowRow = {
  id: string;
  userId: string;
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  startTime: string;
  endTime: string;
  notes: string | null;
  createdAt: Date;
};

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

const DAY_ORDER: Record<string, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

/** Pure ordering function for availability windows: dayOfWeek, then startTime. */
export function sortAvailability<T extends { dayOfWeek: string; startTime: string }>(
  windows: T[],
): T[] {
  return [...windows].sort((a, b) => {
    const da = DAY_ORDER[a.dayOfWeek] ?? 7;
    const db = DAY_ORDER[b.dayOfWeek] ?? 7;
    if (da !== db) return da - db;
    return a.startTime.localeCompare(b.startTime);
  });
}

/** Pure resolver for `Query.myAvailability`. */
export async function resolveMyAvailability(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.availabilityWindow.findMany({
    ...query,
    where: { userId: ctx.auth.user.id },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

/** Pure resolver for `Query.userAvailability(userId)`. Manager scope. */
export async function resolveUserAvailability(
  query: object,
  ctx: RequestContext,
  userId: string,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can view another user availability');
  }
  // Verify the user belongs to the viewer's tenant via membership.
  const membership = await ctx.prisma.membership.findFirst({
    where: { userId, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!membership) throw new ForbiddenError('User not found in tenant');
  return ctx.prisma.availabilityWindow.findMany({
    ...query,
    where: { userId },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

export const AvailabilityWindowRef = builder.prismaObject('AvailabilityWindow', {
  fields: (t) => ({
    id: t.exposeID('id'),
    dayOfWeek: t.field({
      type: DayOfWeekEnum,
      resolve: (parent) => parent.dayOfWeek,
    }),
    startTime: t.exposeString('startTime'),
    endTime: t.exposeString('endTime'),
    notes: t.exposeString('notes', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.queryField('myAvailability', (t) =>
  t.prismaField({
    type: ['AvailabilityWindow'],
    description: 'Availability windows declared by the viewer.',
    authScopes: { authenticated: true },
    resolve: (query, _root, _args, ctx) => resolveMyAvailability(query, ctx) as never,
  }),
);

builder.queryField('userAvailability', (t) =>
  t.prismaField({
    type: ['AvailabilityWindow'],
    description: 'Availability windows for a given user. Manager scope.',
    authScopes: { manager: true },
    args: { userId: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveUserAvailability(query, ctx, args.userId as string) as never,
  }),
);
