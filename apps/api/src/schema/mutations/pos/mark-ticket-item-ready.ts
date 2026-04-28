import { markTicketItemReadySchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { canTransitionTicketItem } from '../../../order/state.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { MarkTicketItemReadyInput } from './inputs.js';

export interface MarkTicketItemReadyArgs {
  ticketItemId: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveMarkTicketItemReady(
  query: object,
  input: MarkTicketItemReadyArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can mark items ready');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
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
    throw new ConflictError('Ticket must be OPEN');
  }
  if (!canTransitionTicketItem(item.status, 'READY')) {
    throw new ConflictError(`Cannot mark ready an item with status ${item.status}`);
  }
  const updated = (await ctx.prisma.ticketItem.update({
    ...query,
    where: { id: item.id },
    data: { status: 'READY', readyAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'ticket_item.marked_ready',
    resourceType: 'ticket_item',
    resourceId: updated.id,
    metadata: { ticketId: item.ticketId },
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

builder.mutationField('markTicketItemReady', (t) =>
  t.prismaField({
    type: 'TicketItem',
    authScopes: { staff: true },
    args: { input: t.arg({ type: MarkTicketItemReadyInput, required: true }) },
    validate: { schema: z.object({ input: markTicketItemReadySchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveMarkTicketItemReady(
        query,
        args.input as MarkTicketItemReadyArgs,
        ctx,
      ) as never,
  }),
);
