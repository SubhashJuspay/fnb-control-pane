import { confirmReservationSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ConfirmReservationInput } from './inputs.js';

export interface ConfirmReservationArgs {
  id: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveConfirmReservation(
  query: object,
  input: ConfirmReservationArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can confirm reservations');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const existing = await ctx.prisma.reservation.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, status: true, tableId: true },
  });
  if (!existing) throw new NotFoundError('Reservation not found');
  if (existing.status !== 'PENDING') {
    throw new ConflictError(
      `Cannot confirm a reservation with status ${existing.status}`,
    );
  }
  const updated = (await ctx.prisma.reservation.update({
    ...query,
    where: { id: input.id },
    data: { status: 'CONFIRMED' },
  })) as { id: string; tableId: string | null };
  await writeAudit(ctx, {
    action: 'reservation.confirmed',
    resourceType: 'reservation',
    resourceId: updated.id,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'ReservationChanged',
    reservationId: updated.id,
  });
  if (updated.tableId) {
    await pubsub.publish(floorChannelName(locationId), {
      kind: 'TableChanged',
      tableId: updated.tableId,
    });
  }
  return updated;
}

builder.mutationField('confirmReservation', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ConfirmReservationInput, required: true }) },
    validate: { schema: z.object({ input: confirmReservationSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveConfirmReservation(query, args.input as ConfirmReservationArgs, ctx) as never,
  }),
);
