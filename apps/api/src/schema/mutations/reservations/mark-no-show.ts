import { markNoShowSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { MarkNoShowInput } from './inputs.js';

export interface MarkNoShowArgs {
  id: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveMarkNoShow(
  query: object,
  input: MarkNoShowArgs,
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can mark no-show');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const existing = await ctx.prisma.reservation.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, status: true, requestedTime: true, tableId: true },
  });
  if (!existing) throw new NotFoundError('Reservation not found');
  if (existing.status !== 'CONFIRMED') {
    throw new ConflictError(
      `Cannot mark no-show on a reservation with status ${existing.status}`,
    );
  }
  if (!existing.requestedTime || existing.requestedTime.getTime() > now.getTime()) {
    throw new ConflictError(
      'Cannot mark no-show before the reservation requested time',
    );
  }
  const updated = (await ctx.prisma.reservation.update({
    ...query,
    where: { id: input.id },
    data: { status: 'NO_SHOW', noShowAt: now },
  })) as { id: string; tableId: string | null };
  await writeAudit(ctx, {
    action: 'reservation.no_show',
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

builder.mutationField('markReservationNoShow', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: MarkNoShowInput, required: true }) },
    validate: { schema: z.object({ input: markNoShowSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveMarkNoShow(query, args.input as MarkNoShowArgs, ctx) as never,
  }),
);
