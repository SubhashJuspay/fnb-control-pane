import { linkReservationGuestSchema } from '@repo/validation/guest';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { LinkReservationGuestInput } from './inputs.js';

export interface LinkReservationGuestArgs {
  reservationId: string;
  guestId?: string | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveLinkReservationGuest(
  query: object,
  input: LinkReservationGuestArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only staff or above can link a guest to a reservation');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;

  const reservation = await ctx.prisma.reservation.findFirst({
    where: { id: input.reservationId, locationId },
    select: { id: true, guestId: true, requestedTime: true, createdAt: true },
  });
  if (!reservation) throw new NotFoundError('Reservation not found');

  if (!input.guestId) {
    const updated = (await ctx.prisma.reservation.update({
      ...query,
      where: { id: reservation.id },
      data: { guestId: null },
    })) as { id: string };
    await writeAudit(ctx, {
      action: 'reservation.guest_unlinked',
      resourceType: 'reservation',
      resourceId: updated.id,
      metadata: { previousGuestId: reservation.guestId },
    });
    await pubsub.publish(floorChannelName(locationId), {
      kind: 'ReservationChanged',
      reservationId: updated.id,
    });
    return updated;
  }

  const guest = await ctx.prisma.guest.findFirst({
    where: { id: input.guestId, tenantId },
    select: { id: true, lastSeenAt: true },
  });
  if (!guest) throw new NotFoundError('Guest not found');

  const updated = (await ctx.prisma.reservation.update({
    ...query,
    where: { id: reservation.id },
    data: { guestId: guest.id },
  })) as { id: string };

  // Refresh lastSeenAt only if the reservation's createdAt is more recent than
  // the current value. requestedTime is forward-looking and not a "visit", so
  // we use createdAt as the "interaction" timestamp.
  const candidate = reservation.createdAt;
  if (
    !guest.lastSeenAt ||
    candidate.getTime() > guest.lastSeenAt.getTime()
  ) {
    await ctx.prisma.guest.update({
      where: { id: guest.id },
      data: { lastSeenAt: candidate },
    });
  }

  await writeAudit(ctx, {
    action: 'reservation.guest_linked',
    resourceType: 'reservation',
    resourceId: updated.id,
    metadata: { guestId: guest.id },
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'ReservationChanged',
    reservationId: updated.id,
  });
  return updated;
}

builder.mutationField('linkReservationGuest', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { staff: true },
    args: { input: t.arg({ type: LinkReservationGuestInput, required: true }) },
    validate: { schema: z.object({ input: linkReservationGuestSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveLinkReservationGuest(
        query,
        args.input as LinkReservationGuestArgs,
        ctx,
      ) as never,
  }),
);
