import type { PrismaClient } from '@repo/db';
import { floorChannelName, pubsub } from '../pubsub.js';

export interface CompleteReservationAfterCloseArgs {
  prisma: PrismaClient;
  ticketId: string;
  locationId: string;
}

/**
 * Post-commit hook fired from POS `closeTicket`. If the just-closed ticket has
 * a SEATED reservation linked to it, transition the reservation to COMPLETED
 * and publish ReservationChanged + (when applicable) TableChanged events on
 * the floor channel.
 *
 * Pure side-effect: never returns the reservation; never throws to the caller.
 * Failures are silently caught — the ticket close itself is the source of
 * truth and must not be blocked by floor-side bookkeeping.
 */
export async function completeReservationAfterClose(
  args: CompleteReservationAfterCloseArgs,
): Promise<void> {
  try {
    const reservation = await args.prisma.reservation.findFirst({
      where: { ticketId: args.ticketId, status: 'SEATED' },
      select: { id: true, tableId: true },
    });
    if (!reservation) return;
    await args.prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await pubsub.publish(floorChannelName(args.locationId), {
      kind: 'ReservationChanged',
      reservationId: reservation.id,
    });
    if (reservation.tableId) {
      await pubsub.publish(floorChannelName(args.locationId), {
        kind: 'TableChanged',
        tableId: reservation.tableId,
      });
    }
  } catch {
    // Swallow — closing the POS ticket must succeed even if the reservation
    // side-effect fails (e.g. transient pubsub error). The reservation can be
    // manually completed from the reservations book.
  }
}
