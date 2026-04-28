import { voidTicketItemSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { canTransitionTicketItem } from '../../../order/state.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { VoidTicketItemInput } from './inputs.js';
import { recomputeTicketTotalsLive } from './recompute-totals.js';

export interface VoidTicketItemArgs {
  ticketItemId: string;
  voidReason: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveVoidTicketItem(
  query: object,
  input: VoidTicketItemArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can void ticket items');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const item = await ctx.prisma.ticketItem.findUnique({
    where: { id: input.ticketItemId },
    select: {
      id: true,
      status: true,
      ticketId: true,
      ticket: { select: { locationId: true, status: true } },
    },
  });
  if (!item) throw new NotFoundError('Ticket item not found');
  if (item.ticket.locationId !== locationId) {
    throw new ForbiddenError('Ticket item not found at this location');
  }
  if (item.ticket.status !== 'OPEN') {
    throw new ConflictError('Ticket must be OPEN to void items');
  }
  if (!canTransitionTicketItem(item.status, 'VOIDED')) {
    throw new ConflictError(`Cannot void an item with status ${item.status}`);
  }
  const updated = (await ctx.prisma.ticketItem.update({
    ...query,
    where: { id: item.id },
    data: {
      status: 'VOIDED',
      voidedById: userId,
      voidedAt: new Date(),
      voidReason: input.voidReason,
    },
  })) as { id: string };
  await recomputeTicketTotalsLive({ prisma: ctx.prisma, ticketId: item.ticketId });
  await writeAudit(ctx, {
    action: 'ticket_item.voided',
    resourceType: 'ticket_item',
    resourceId: updated.id,
    metadata: { voidReason: input.voidReason, ticketId: item.ticketId },
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

builder.mutationField('voidTicketItem', (t) =>
  t.prismaField({
    type: 'TicketItem',
    authScopes: { staff: true },
    args: { input: t.arg({ type: VoidTicketItemInput, required: true }) },
    validate: { schema: z.object({ input: voidTicketItemSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveVoidTicketItem(query, args.input as VoidTicketItemArgs, ctx) as never,
  }),
);
