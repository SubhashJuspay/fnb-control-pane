import { createReservationSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { CreateReservationInput } from './inputs.js';

export interface CreateReservationArgs {
  guestName: string;
  guestPhone?: string | null;
  partySize: number;
  requestedTime: Date;
  durationMinutes?: number | null;
  tableId?: string | null;
  notes?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveCreateReservation(
  query: object,
  input: CreateReservationArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can create reservations');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  if (input.tableId) {
    const table = await ctx.prisma.table.findFirst({
      where: { id: input.tableId, locationId, archivedAt: null },
      select: { id: true },
    });
    if (!table) throw new NotFoundError('Table not found');
  }

  const created = (await ctx.prisma.reservation.create({
    ...query,
    data: {
      locationId,
      kind: 'RESERVATION',
      status: 'PENDING',
      guestName: input.guestName,
      guestPhone: input.guestPhone ?? null,
      partySize: input.partySize,
      requestedTime: input.requestedTime,
      durationMinutes: input.durationMinutes ?? 90,
      tableId: input.tableId ?? null,
      notes: input.notes ?? null,
      createdById: ctx.auth.user.id,
    },
  })) as { id: string; tableId: string | null };
  await writeAudit(ctx, {
    action: 'reservation.created',
    resourceType: 'reservation',
    resourceId: created.id,
    metadata: {
      partySize: input.partySize,
      requestedTime: input.requestedTime,
      tableId: input.tableId ?? null,
    },
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'ReservationChanged',
    reservationId: created.id,
  });
  if (created.tableId) {
    await pubsub.publish(floorChannelName(locationId), {
      kind: 'TableChanged',
      tableId: created.tableId,
    });
  }
  return created;
}

builder.mutationField('createReservation', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CreateReservationInput, required: true }) },
    validate: { schema: z.object({ input: createReservationSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateReservation(query, args.input as CreateReservationArgs, ctx) as never,
  }),
);
