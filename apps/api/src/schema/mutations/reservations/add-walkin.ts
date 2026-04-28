import { addWalkinSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { AddWalkinInput } from './inputs.js';

export interface AddWalkinArgs {
  guestName: string;
  guestPhone?: string | null;
  partySize: number;
  notes?: string | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveAddWalkin(
  query: object,
  input: AddWalkinArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can add walk-ins');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const created = (await ctx.prisma.reservation.create({
    ...query,
    data: {
      locationId,
      kind: 'WALKIN',
      status: 'WAITING',
      guestName: input.guestName,
      guestPhone: input.guestPhone ?? null,
      partySize: input.partySize,
      requestedTime: null,
      durationMinutes: 90,
      notes: input.notes ?? null,
      createdById: ctx.auth.user.id,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'walkin.added',
    resourceType: 'reservation',
    resourceId: created.id,
    metadata: { partySize: input.partySize },
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'ReservationChanged',
    reservationId: created.id,
  });
  return created;
}

builder.mutationField('addWalkin', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { staff: true },
    args: { input: t.arg({ type: AddWalkinInput, required: true }) },
    validate: { schema: z.object({ input: addWalkinSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveAddWalkin(query, args.input as AddWalkinArgs, ctx) as never,
  }),
);
