import { completeReservationSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { CompleteReservationInput } from './inputs.js';

export interface CompleteReservationArgs {
  id: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveCompleteReservation(
  query: object,
  input: CompleteReservationArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can complete reservations');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const existing = await ctx.prisma.reservation.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, status: true, tableId: true },
  });
  if (!existing) throw new NotFoundError('Reservation not found');
  if (existing.status !== 'SEATED') {
    throw new ConflictError(
      `Cannot complete a reservation with status ${existing.status}`,
    );
  }
  const updated = (await ctx.prisma.reservation.update({
    ...query,
    where: { id: input.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })) as { id: string; tableId: string | null };
  await writeAudit(ctx, {
    action: 'reservation.completed',
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

builder.mutationField('completeReservation', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CompleteReservationInput, required: true }) },
    validate: { schema: z.object({ input: completeReservationSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCompleteReservation(query, args.input as CompleteReservationArgs, ctx) as never,
  }),
);
