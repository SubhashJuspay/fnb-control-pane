import { seatReservationSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { openTicketBoundToTable } from '../../../floor/open-ticket.js';
import {
  floorChannelName,
  pubsub,
  ticketChannelName,
} from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { SeatReservationInput } from './inputs.js';

export interface SeatReservationArgs {
  reservationId: string;
  tableId?: string | null;
}

export interface SeatReservationResult {
  reservationId: string;
  ticketId: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];
const SEATABLE = new Set(['PENDING', 'CONFIRMED', 'WAITING']);

export async function resolveSeatReservation(
  input: SeatReservationArgs,
  ctx: RequestContext,
): Promise<SeatReservationResult> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can seat reservations');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const existing = await ctx.prisma.reservation.findFirst({
    where: { id: input.reservationId, locationId },
    select: {
      id: true,
      status: true,
      tableId: true,
      guestName: true,
    },
  });
  if (!existing) throw new NotFoundError('Reservation not found');
  if (!SEATABLE.has(existing.status)) {
    throw new ConflictError(
      `Cannot seat a reservation with status ${existing.status}`,
    );
  }
  const tableId = input.tableId ?? existing.tableId;
  if (!tableId) {
    throw new ConflictError('No table assigned');
  }

  // Open the bound ticket OUTSIDE the transaction — `openTicketBoundToTable`
  // already runs its own retry loop. We then atomically link it onto the
  // reservation. (If the link step fails the ticket would orphan; the unique
  // (locationId, businessDay, shortNumber) constraint plus tableId check
  // prevent silent duplicates, and the staff member can manually close the
  // orphan or the auto-cleanup at next close cycle handles it.)
  const ticketResult = await openTicketBoundToTable({
    prisma: ctx.prisma,
    ctx,
    tableId,
    customerLabel: existing.guestName,
    orderType: 'DINE_IN',
  });

  await ctx.prisma.reservation.update({
    where: { id: existing.id },
    data: {
      status: 'SEATED',
      seatedAt: new Date(),
      tableId,
      ticketId: ticketResult.ticketId,
    },
  });

  await writeAudit(ctx, {
    action: 'reservation.seated',
    resourceType: 'reservation',
    resourceId: existing.id,
    metadata: { tableId, ticketId: ticketResult.ticketId },
  });
  await writeAudit(ctx, {
    action: 'ticket.opened_at_table',
    resourceType: 'ticket',
    resourceId: ticketResult.ticketId,
    metadata: {
      tableId,
      reservationId: existing.id,
      shortNumber: ticketResult.shortNumber,
      businessDay: ticketResult.businessDay,
    },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: ticketResult.ticketId,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'ReservationChanged',
    reservationId: existing.id,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'TableChanged',
    tableId,
  });

  return { reservationId: existing.id, ticketId: ticketResult.ticketId };
}

const SeatReservationResultRef = builder.objectRef<SeatReservationResult>(
  'SeatReservationResult',
);
SeatReservationResultRef.implement({
  description: 'Result of seating a reservation: the reservation and its newly opened ticket.',
  fields: (t) => ({
    reservation: t.prismaField({
      type: 'Reservation',
      resolve: (query, parent, _args, ctx) =>
        ctx.prisma.reservation.findUniqueOrThrow({
          ...query,
          where: { id: parent.reservationId },
        }) as never,
    }),
    ticket: t.prismaField({
      type: 'Ticket',
      resolve: (query, parent, _args, ctx) =>
        ctx.prisma.ticket.findUniqueOrThrow({
          ...query,
          where: { id: parent.ticketId },
        }) as never,
    }),
  }),
});

builder.mutationField('seatReservation', (t) =>
  t.field({
    type: SeatReservationResultRef,
    authScopes: { staff: true },
    args: { input: t.arg({ type: SeatReservationInput, required: true }) },
    validate: { schema: z.object({ input: seatReservationSchema }) },
    resolve: (_root, args, ctx) =>
      resolveSeatReservation(args.input as SeatReservationArgs, ctx),
  }),
);
