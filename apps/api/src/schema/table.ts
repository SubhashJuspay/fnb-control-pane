import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { deriveTableState, isReservationImminent, type DerivedTableState } from '../floor/state.js';
import { builder } from './builder.js';
import { TableManualStateEnum, TableShapeEnum, TableStateEnum } from './enums.js';

export type TableRow = {
  id: string;
  locationId: string;
  sectionId: string | null;
  label: string;
  capacity: number;
  shape: 'RECT' | 'CIRCLE';
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  manualState: 'NONE' | 'CLEANING';
  assignedServerId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const IMMINENT_WINDOW_MINUTES = 15;
const UPCOMING_WINDOW_MINUTES = 120;

/**
 * Pure resolver for `Table.state`. Loads a tally of OPEN tickets for the table
 * and a list of PENDING/CONFIRMED reservations within ±15min, then defers to
 * `deriveTableState` for precedence.
 */
export async function resolveTableState(
  parent: { id: string; manualState: 'NONE' | 'CLEANING' },
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<DerivedTableState> {
  const openTicketCount = await ctx.prisma.ticket.count({
    where: { tableId: parent.id, status: 'OPEN' },
  });
  let hasImminentReservation = false;
  if (openTicketCount === 0 && parent.manualState !== 'CLEANING') {
    const windowStart = new Date(now.getTime() - IMMINENT_WINDOW_MINUTES * 60_000);
    const windowEnd = new Date(now.getTime() + IMMINENT_WINDOW_MINUTES * 60_000);
    const reservations = (await ctx.prisma.reservation.findMany({
      where: {
        tableId: parent.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        requestedTime: { gte: windowStart, lte: windowEnd },
      },
      select: { status: true, requestedTime: true },
    })) as Array<{
      status: 'PENDING' | 'CONFIRMED';
      requestedTime: Date | null;
    }>;
    hasImminentReservation = reservations.some((r) =>
      isReservationImminent({
        status: r.status,
        requestedTime: r.requestedTime,
        now,
        windowMinutes: IMMINENT_WINDOW_MINUTES,
      }),
    );
  }
  return deriveTableState({
    manualState: parent.manualState,
    hasOpenTicket: openTicketCount > 0,
    hasImminentReservation,
  });
}

/** Pure resolver for `Table.activeTicket`. */
export async function resolveActiveTicket(
  parent: { id: string },
  ctx: RequestContext,
): Promise<unknown | null> {
  return ctx.prisma.ticket.findFirst({
    where: { tableId: parent.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
}

/** Pure resolver for `Table.upcomingReservation`. */
export async function resolveUpcomingReservation(
  parent: { id: string },
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<unknown | null> {
  const windowEnd = new Date(now.getTime() + UPCOMING_WINDOW_MINUTES * 60_000);
  return ctx.prisma.reservation.findFirst({
    where: {
      tableId: parent.id,
      status: { in: ['PENDING', 'CONFIRMED'] },
      requestedTime: { gte: now, lte: windowEnd },
    },
    orderBy: { requestedTime: 'asc' },
  });
}

/** Pure resolver for `Query.floorTables`. */
export async function resolveFloorTables(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.table.findMany({
    ...query,
    where: { locationId: ctx.auth.location.id, archivedAt: null },
    orderBy: [{ label: 'asc' }],
  });
}

export const TableRef = builder.prismaObject('Table', {
  fields: (t) => ({
    id: t.exposeID('id'),
    label: t.exposeString('label'),
    slug: t.exposeString('slug'),
    capacity: t.exposeInt('capacity'),
    shape: t.field({
      type: TableShapeEnum,
      resolve: (parent) => parent.shape,
    }),
    positionX: t.exposeInt('positionX'),
    positionY: t.exposeInt('positionY'),
    width: t.exposeInt('width'),
    height: t.exposeInt('height'),
    rotation: t.exposeInt('rotation'),
    manualState: t.field({
      type: TableManualStateEnum,
      resolve: (parent) => parent.manualState,
    }),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    section: t.relation('section', {
      authScopes: { staff: true },
      nullable: true,
    }),
    assignedServer: t.relation('assignedServer', {
      authScopes: { staff: true },
      nullable: true,
    }),
    state: t.field({
      type: TableStateEnum,
      authScopes: { staff: true },
      resolve: (parent, _args, ctx) =>
        resolveTableState(parent as TableRow, ctx),
    }),
    activeTicket: t.prismaField({
      type: 'Ticket',
      nullable: true,
      authScopes: { staff: true },
      resolve: (_query, parent, _args, ctx) =>
        resolveActiveTicket(parent as { id: string }, ctx) as never,
    }),
    upcomingReservation: t.prismaField({
      type: 'Reservation',
      nullable: true,
      authScopes: { staff: true },
      resolve: (_query, parent, _args, ctx) =>
        resolveUpcomingReservation(parent as { id: string }, ctx) as never,
    }),
  }),
});

builder.queryField('floorTables', (t) =>
  t.prismaField({
    type: ['Table'],
    description: "Non-archived tables at the viewer's location, ordered by label asc.",
    authScopes: { staff: true },
    resolve: (query, _root, _args, ctx) => resolveFloorTables(query, ctx) as never,
  }),
);
