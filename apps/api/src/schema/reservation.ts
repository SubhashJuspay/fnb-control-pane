import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { ReservationKindEnum, ReservationStatusEnum } from './enums.js';

export type ReservationRow = {
  id: string;
  locationId: string;
  kind: 'RESERVATION' | 'WALKIN';
  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'WAITING'
    | 'SEATED'
    | 'COMPLETED'
    | 'NO_SHOW'
    | 'CANCELLED';
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  notes: string | null;
  requestedTime: Date | null;
  durationMinutes: number;
  tableId: string | null;
  ticketId: string | null;
  seatedAt: Date | null;
  completedAt: Date | null;
  noShowAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Compute the half-open [start, end) UTC range covering the local calendar day
 * `dateString` (YYYY-MM-DD) in the given timezone. End is start of next day.
 */
export function computeDayRange(
  dateString: string,
  timezone: string,
): { start: Date; end: Date } {
  const start = fromZonedTime(`${dateString}T00:00:00`, timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Format a Date as `YYYY-MM-DD` in the given timezone. */
export function formatDateInZone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

/** Pure resolver for `Query.reservationsForDay(date)`. */
export async function resolveReservationsForDay(
  query: object,
  ctx: RequestContext,
  date: Date,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const tz = ctx.auth.location.timezone;
  const dateStr = formatDateInZone(date, tz);
  const { start, end } = computeDayRange(dateStr, tz);
  return ctx.prisma.reservation.findMany({
    ...query,
    where: {
      locationId: ctx.auth.location.id,
      requestedTime: { gte: start, lt: end },
    },
    orderBy: { requestedTime: 'asc' },
  });
}

/** Pure resolver for `Query.reservationsActive`. */
export async function resolveReservationsActive(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.reservation.findMany({
    ...query,
    where: {
      locationId: ctx.auth.location.id,
      status: { in: ['WAITING', 'SEATED'] },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Pure resolver for `Query.waitlist`. */
export async function resolveWaitlist(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.reservation.findMany({
    ...query,
    where: {
      locationId: ctx.auth.location.id,
      kind: 'WALKIN',
      status: 'WAITING',
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Pure resolver for `Query.reservation(id)`. */
export async function resolveReservation(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.reservation.findFirst({
    ...query,
    where: { id, locationId: ctx.auth.location.id },
  });
}

export const ReservationRef = builder.prismaObject('Reservation', {
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({
      type: ReservationKindEnum,
      resolve: (parent) => parent.kind,
    }),
    status: t.field({
      type: ReservationStatusEnum,
      resolve: (parent) => parent.status,
    }),
    guestName: t.exposeString('guestName'),
    guestPhone: t.exposeString('guestPhone', { nullable: true }),
    partySize: t.exposeInt('partySize'),
    notes: t.exposeString('notes', { nullable: true }),
    requestedTime: t.expose('requestedTime', { type: 'DateTime', nullable: true }),
    durationMinutes: t.exposeInt('durationMinutes'),
    seatedAt: t.expose('seatedAt', { type: 'DateTime', nullable: true }),
    completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
    noShowAt: t.expose('noShowAt', { type: 'DateTime', nullable: true }),
    cancelledAt: t.expose('cancelledAt', { type: 'DateTime', nullable: true }),
    cancelReason: t.exposeString('cancelReason', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    table: t.relation('table', {
      authScopes: { staff: true },
      nullable: true,
    }),
    ticket: t.relation('ticket', {
      authScopes: { staff: true },
      nullable: true,
    }),
    createdBy: t.relation('createdBy', { authScopes: { staff: true } }),
  }),
});

builder.queryField('reservationsForDay', (t) =>
  t.prismaField({
    type: ['Reservation'],
    description:
      "Reservations whose requestedTime falls on the given day (in the location's timezone), ordered by requestedTime asc.",
    authScopes: { staff: true },
    args: { date: t.arg({ type: 'DateTime', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveReservationsForDay(query, ctx, args.date as Date) as never,
  }),
);

builder.queryField('reservationsActive', (t) =>
  t.prismaField({
    type: ['Reservation'],
    description: "Reservations currently WAITING or SEATED at the viewer's location.",
    authScopes: { staff: true },
    resolve: (query, _root, _args, ctx) =>
      resolveReservationsActive(query, ctx) as never,
  }),
);

builder.queryField('waitlist', (t) =>
  t.prismaField({
    type: ['Reservation'],
    description:
      "Walk-ins currently WAITING at the viewer's location, ordered by createdAt asc (oldest first).",
    authScopes: { staff: true },
    resolve: (query, _root, _args, ctx) => resolveWaitlist(query, ctx) as never,
  }),
);

builder.queryField('reservation', (t) =>
  t.prismaField({
    type: 'Reservation',
    nullable: true,
    description: "Single reservation by id, scoped to the viewer's location.",
    authScopes: { staff: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveReservation(query, ctx, args.id as string) as never,
  }),
);
