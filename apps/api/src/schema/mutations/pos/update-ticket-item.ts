import { updateTicketItemSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { computeLineSubtotalCents } from '../../../order/pricing.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { UpdateTicketItemInput } from './inputs.js';
import { recomputeTicketTotalsLive } from './recompute-totals.js';

export interface UpdateTicketItemArgs {
  ticketItemId: string;
  quantity?: number | null;
  notes?: string | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveUpdateTicketItem(
  query: object,
  input: UpdateTicketItemArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can update ticket items');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const item = await ctx.prisma.ticketItem.findUnique({
    where: { id: input.ticketItemId },
    select: {
      id: true,
      status: true,
      unitPriceCents: true,
      ticketId: true,
      ticket: { select: { locationId: true, status: true } },
      modifiers: { select: { priceDeltaCents: true } },
    },
  });
  if (!item) throw new NotFoundError('Ticket item not found');
  if (item.ticket.locationId !== locationId) {
    throw new ForbiddenError('Ticket item not found at this location');
  }
  if (item.ticket.status !== 'OPEN') {
    throw new ConflictError('Ticket must be OPEN to update items');
  }
  if (item.status !== 'NEW') {
    throw new ConflictError('Only NEW items can be updated');
  }

  const data: Record<string, unknown> = {};
  let newQuantity = (item as unknown as { quantity?: number }).quantity ?? 1;
  if (input.quantity !== undefined && input.quantity !== null) {
    newQuantity = input.quantity;
    data.quantity = input.quantity;
  }
  if (input.notes !== undefined) {
    data.notes = input.notes;
  }
  // Always recompute line subtotal in case quantity changed.
  const { modifiersTotalCents, lineSubtotalCents } = computeLineSubtotalCents({
    unitPriceCents: item.unitPriceCents,
    quantity: newQuantity,
    modifiers: item.modifiers,
  });
  data.modifiersTotalCents = modifiersTotalCents;
  data.lineSubtotalCents = lineSubtotalCents;

  const updated = (await ctx.prisma.ticketItem.update({
    ...query,
    where: { id: item.id },
    data,
  })) as { id: string };

  await recomputeTicketTotalsLive({ prisma: ctx.prisma, ticketId: item.ticketId });
  await writeAudit(ctx, {
    action: 'ticket_item.updated',
    resourceType: 'ticket_item',
    resourceId: updated.id,
    metadata: { quantity: input.quantity, notes: input.notes },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketItemChanged',
    ticketId: item.ticketId,
    ticketItemId: updated.id,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: item.ticketId,
  });
  return updated;
}

builder.mutationField('updateTicketItem', (t) =>
  t.prismaField({
    type: 'TicketItem',
    authScopes: { staff: true },
    args: { input: t.arg({ type: UpdateTicketItemInput, required: true }) },
    validate: { schema: z.object({ input: updateTicketItemSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateTicketItem(query, args.input as UpdateTicketItemArgs, ctx) as never,
  }),
);
