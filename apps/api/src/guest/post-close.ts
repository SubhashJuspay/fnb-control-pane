import type { PrismaClient } from '@repo/db';

export interface UpdateGuestLastSeenAfterCloseArgs {
  prisma: PrismaClient;
  ticketId: string;
  locationId: string;
}

/**
 * Post-commit hook fired from POS `closeTicket`. If the just-closed ticket has
 * a linked guest, set `Guest.lastSeenAt = ticket.closedAt` (only if newer than
 * the current value). The ticket must belong to the supplied `locationId` —
 * cross-location calls are silently ignored.
 *
 * Pure side-effect: never returns the guest; never throws to the caller.
 * Failures are silently swallowed — the ticket close itself is the source of
 * truth and must not be blocked by guest-CRM bookkeeping.
 */
export async function updateGuestLastSeenAfterClose(
  args: UpdateGuestLastSeenAfterCloseArgs,
): Promise<void> {
  try {
    const ticket = await args.prisma.ticket.findFirst({
      where: { id: args.ticketId, locationId: args.locationId },
      select: { guestId: true, closedAt: true },
    });
    if (!ticket || !ticket.guestId || !ticket.closedAt) return;
    const guest = await args.prisma.guest.findUnique({
      where: { id: ticket.guestId },
      select: { lastSeenAt: true },
    });
    if (!guest) return;
    if (guest.lastSeenAt && guest.lastSeenAt.getTime() >= ticket.closedAt.getTime()) {
      return;
    }
    await args.prisma.guest.update({
      where: { id: ticket.guestId },
      data: { lastSeenAt: ticket.closedAt },
    });
  } catch {
    // Swallow — closing the POS ticket must succeed even if the guest-CRM
    // side-effect fails. The lastSeenAt timestamp can be reconciled by the
    // next manual link or the next ticket close for the same guest.
  }
}

export interface AccrueGuestPointsAfterCloseArgs {
  prisma: PrismaClient;
  ticketId: string;
  locationId: string;
}

/**
 * Post-commit hook fired from POS `closeTicket`. If the just-closed ticket
 * has a linked guest and a non-zero `pointsEarned`, increment the guest's
 * lifetime balance. Atomic Prisma `increment` so concurrent closes don't
 * stomp each other.
 *
 * Failures are swallowed — the ticket close is the source of truth.
 */
export async function accrueGuestPointsAfterClose(
  args: AccrueGuestPointsAfterCloseArgs,
): Promise<void> {
  try {
    const ticket = await args.prisma.ticket.findFirst({
      where: { id: args.ticketId, locationId: args.locationId },
      select: { guestId: true, pointsEarned: true },
    });
    if (!ticket || !ticket.guestId || ticket.pointsEarned <= 0) return;
    await args.prisma.guest.update({
      where: { id: ticket.guestId },
      data: { pointsBalance: { increment: ticket.pointsEarned } },
    });
  } catch {
    // Best-effort — close still succeeds.
  }
}
