import { updateReservationSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { UpdateReservationInput } from './inputs.js';

export interface UpdateReservationArgs {
  id: string;
  guestName?: string | null;
  guestPhone?: string | null;
  partySize?: number | null;
  requestedTime?: Date | null;
  durationMinutes?: number | null;
  tableId?: string | null;
  notes?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];
const MUTABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', 'WAITING']);

export async function resolveUpdateReservation(
  query: object,
  input: UpdateReservationArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can update reservations');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const existing = await ctx.prisma.reservation.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, status: true, tableId: true },
  });
  if (!existing) throw new NotFoundError('Reservation not found');
  if (!MUTABLE_STATUSES.has(existing.status)) {
    throw new ConflictError(
      `Cannot update a reservation with status ${existing.status}`,
    );
  }

  if (input.tableId !== undefined && input.tableId !== null) {
    const table = await ctx.prisma.table.findFirst({
      where: { id: input.tableId, locationId, archivedAt: null },
      select: { id: true },
    });
    if (!table) throw new NotFoundError('Table not found');
  }

  const data: Record<string, unknown> = {};
  if (input.guestName !== undefined && input.guestName !== null) data.guestName = input.guestName;
  if (input.guestPhone !== undefined) data.guestPhone = input.guestPhone;
  if (input.partySize !== undefined && input.partySize !== null) data.partySize = input.partySize;
  if (input.requestedTime !== undefined && input.requestedTime !== null) {
    data.requestedTime = input.requestedTime;
  }
  if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
    data.durationMinutes = input.durationMinutes;
  }
  if (input.tableId !== undefined) data.tableId = input.tableId;
  if (input.notes !== undefined) data.notes = input.notes;

  const updated = (await ctx.prisma.reservation.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string; tableId: string | null };
  await writeAudit(ctx, {
    action: 'reservation.updated',
    resourceType: 'reservation',
    resourceId: updated.id,
    metadata: data,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'ReservationChanged',
    reservationId: updated.id,
  });
  // Publish TableChanged for both old and new table when tableId moved.
  const tableIds = new Set<string>();
  if (existing.tableId) tableIds.add(existing.tableId);
  if (updated.tableId) tableIds.add(updated.tableId);
  for (const tid of tableIds) {
    await pubsub.publish(floorChannelName(locationId), {
      kind: 'TableChanged',
      tableId: tid,
    });
  }
  return updated;
}

builder.mutationField('updateReservation', (t) =>
  t.prismaField({
    type: 'Reservation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateReservationInput, required: true }) },
    validate: { schema: z.object({ input: updateReservationSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateReservation(query, args.input as UpdateReservationArgs, ctx) as never,
  }),
);
