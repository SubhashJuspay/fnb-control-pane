import { cancelReservationSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { CancelReservationInput } from './inputs.js';

export interface CancelReservationArgs {
  id: string;
  cancelReason?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];
const CANCELLABLE = new Set(['PENDING', 'CONFIRMED', 'WAITING']);

export async function resolveCancelReservation(
  query: object,
  input: CancelReservationArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can cancel reservations');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const existing = await ctx.prisma.reservation.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, status: true, tableId: true },
  });
  if (!existing) throw new NotFoundError('Reservation not found');
  if (!CANCELLABLE.has(existing.status)) {
    throw new ConflictError(
      `Cannot cancel a reservation with status ${existing.status}`,
    );
  }
  const updated = (await ctx.prisma.reservation.update({
    ...query,
    where: { id: input.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: input.cancelReason ?? null,
    },
  })) as { id: string; tableId: string | null };
  await writeAudit(ctx, {
    action: 'reservation.cancelled',
    resourceType: 'reservation',
    resourceId: updated.id,
    metadata: { cancelReason: input.cancelReason ?? null },
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

builder.mutationField('cancelReservation', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CancelReservationInput, required: true }) },
    validate: { schema: z.object({ input: cancelReservationSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCancelReservation(query, args.input as CancelReservationArgs, ctx) as never,
  }),
);
