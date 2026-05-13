import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';

export type GuestRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  lastSeenAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface GuestsFilterArgs {
  search?: string | null;
  archivedOnly?: boolean | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

/** Build a Prisma where for guest list queries, scoped to the current tenant. */
export function buildGuestsWhere(
  tenantId: string,
  filter: GuestsFilterArgs | null | undefined,
): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId };
  if (filter?.archivedOnly) {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }
  if (filter?.search) {
    const term = filter.search.trim();
    if (term.length > 0) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }
  }
  return where;
}

/** Build a Prisma where for the searchGuests typeahead. Always non-archived. */
export function buildSearchGuestsWhere(tenantId: string, query: string): Record<string, unknown> {
  return {
    tenantId,
    archivedAt: null,
    OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { phone: { contains: query, mode: 'insensitive' } },
    ],
  };
}

/** Pure resolver for `Query.guests`. Manager scope, tenant-scoped. */
export async function resolveGuestsQuery(
  query: object,
  ctx: RequestContext,
  filter: GuestsFilterArgs | null | undefined,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can list guests');
  }
  const where = buildGuestsWhere(ctx.auth.tenant.id, filter);
  return ctx.prisma.guest.findMany({
    ...query,
    where,
    orderBy: { name: 'asc' },
  });
}

/** Pure resolver for `Query.guest(id)`. */
export async function resolveGuestById(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can view a guest');
  }
  return ctx.prisma.guest.findFirst({
    ...query,
    where: { id, tenantId: ctx.auth.tenant.id },
  });
}

/** Pure resolver for `Query.searchGuests(query, limit)`. Staff scope. */
export async function resolveSearchGuests(
  query: object,
  ctx: RequestContext,
  search: string,
  limit: number,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  const where = buildSearchGuestsWhere(ctx.auth.tenant.id, search);
  return ctx.prisma.guest.findMany({
    ...query,
    where,
    orderBy: { name: 'asc' },
    take: Math.max(1, Math.min(50, limit)),
  });
}

export const GuestsFilter = builder.inputType('GuestsFilter', {
  fields: (t) => ({
    search: t.string({ required: false }),
    archivedOnly: t.boolean({ required: false }),
  }),
});

export const GuestRef = builder.prismaObject('Guest', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    phone: t.exposeString('phone', { nullable: true }),
    email: t.exposeString('email', { nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    pointsBalance: t.exposeInt('pointsBalance'),
    lastSeenAt: t.expose('lastSeenAt', { type: 'DateTime', nullable: true }),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

    visitCount: t.field({
      type: 'Int',
      authScopes: { staff: true },
      resolve: async (parent, _args, ctx) => {
        if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return 0;
        return ctx.prisma.ticket.count({
          where: {
            guestId: (parent as GuestRow).id,
            locationId: ctx.auth.location.id,
            status: 'CLOSED',
          },
        });
      },
    }),
    totalSpentCents: t.field({
      type: 'Int',
      authScopes: { staff: true },
      resolve: async (parent, _args, ctx) => {
        if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return 0;
        const result = await ctx.prisma.ticket.aggregate({
          where: {
            guestId: (parent as GuestRow).id,
            locationId: ctx.auth.location.id,
            status: 'CLOSED',
          },
          _sum: { totalCents: true },
        });
        return result._sum.totalCents ?? 0;
      },
    }),
    averageTicketCents: t.field({
      type: 'Int',
      authScopes: { staff: true },
      resolve: async (parent, _args, ctx) => {
        if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return 0;
        const result = await ctx.prisma.ticket.aggregate({
          where: {
            guestId: (parent as GuestRow).id,
            locationId: ctx.auth.location.id,
            status: 'CLOSED',
          },
          _sum: { totalCents: true },
          _count: { _all: true },
        });
        const total = result._sum.totalCents ?? 0;
        const count = result._count._all;
        return count > 0 ? Math.round(total / count) : 0;
      },
    }),
    firstVisitAt: t.field({
      type: 'DateTime',
      nullable: true,
      authScopes: { staff: true },
      resolve: async (parent, _args, ctx) => {
        if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return null;
        const row = await ctx.prisma.ticket.findFirst({
          where: {
            guestId: (parent as GuestRow).id,
            locationId: ctx.auth.location.id,
            status: 'CLOSED',
            closedAt: { not: null },
          },
          orderBy: { closedAt: 'asc' },
          select: { closedAt: true },
        });
        return row?.closedAt ?? null;
      },
    }),
    upcomingReservation: t.relation('reservations', {
      authScopes: { staff: true },
      nullable: true,
      query: (_args, ctx) => ({
        where: {
          locationId: ctx.auth.kind === 'authenticated' && ctx.auth.location
            ? ctx.auth.location.id
            : '00000000-0000-0000-0000-000000000000',
          status: { in: ['CONFIRMED', 'PENDING'] },
          requestedTime: { gte: new Date() },
        },
        orderBy: { requestedTime: 'asc' },
        take: 1,
      }),
      resolve: async (queryFn, parent, _args, ctx) => {
        if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return null;
        const now = new Date();
        const row = await ctx.prisma.reservation.findFirst({
          ...(queryFn as object),
          where: {
            guestId: (parent as GuestRow).id,
            locationId: ctx.auth.location.id,
            status: { in: ['CONFIRMED', 'PENDING'] },
            requestedTime: { gte: now },
          },
          orderBy: { requestedTime: 'asc' },
        });
        return row as never;
      },
    }),
    recentTickets: t.relation('tickets', {
      authScopes: { staff: true },
      args: { limit: t.arg.int({ required: false, defaultValue: 10 }) },
      query: (args, ctx) => ({
        where: {
          locationId: ctx.auth.kind === 'authenticated' && ctx.auth.location
            ? ctx.auth.location.id
            : '00000000-0000-0000-0000-000000000000',
          status: 'CLOSED',
        },
        orderBy: { closedAt: 'desc' },
        take: Math.max(1, Math.min(50, (args.limit as number | null | undefined) ?? 10)),
      }),
    }),
  }),
});

builder.queryField('guests', (t) =>
  t.prismaField({
    type: ['Guest'],
    description: 'Guests in the current tenant. Manager scope.',
    authScopes: { manager: true },
    args: { filter: t.arg({ type: GuestsFilter, required: false }) },
    resolve: (query, _root, args, ctx) =>
      resolveGuestsQuery(
        query,
        ctx,
        args.filter as GuestsFilterArgs | null | undefined,
      ) as never,
  }),
);

builder.queryField('guest', (t) =>
  t.prismaField({
    type: 'Guest',
    nullable: true,
    description: 'Single guest by id, scoped to the current tenant.',
    authScopes: { manager: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveGuestById(query, ctx, args.id as string) as never,
  }),
);

builder.queryField('searchGuests', (t) =>
  t.prismaField({
    type: ['Guest'],
    description: 'Typeahead search by name/phone (case-insensitive). Staff scope.',
    authScopes: { staff: true },
    args: {
      query: t.arg({ type: 'String', required: true }),
      limit: t.arg({ type: 'Int', required: false, defaultValue: 10 }),
    },
    resolve: (query, _root, args, ctx) =>
      resolveSearchGuests(
        query,
        ctx,
        args.query as string,
        (args.limit as number | null | undefined) ?? 10,
      ) as never,
  }),
);

// Add `guest` relation fields to existing Ticket and Reservation types so
// the API can return the linked guest from a single ticket/reservation query.
builder.prismaObjectField('Ticket', 'guest', (t) =>
  t.relation('guest', { authScopes: { staff: true }, nullable: true }),
);

builder.prismaObjectField('Reservation', 'guest', (t) =>
  t.relation('guest', { authScopes: { staff: true }, nullable: true }),
);
