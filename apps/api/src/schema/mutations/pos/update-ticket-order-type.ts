import { updateTicketOrderTypeSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { UpdateTicketOrderTypeInput } from './inputs.js';

export interface UpdateTicketOrderTypeArgs {
  ticketId: string;
  orderType: 'DINE_IN' | 'TAKEOUT';
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveUpdateTicketOrderType(
  query: object,
  input: UpdateTicketOrderTypeArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can update tickets');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: { id: true, status: true },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.status !== 'OPEN') {
    throw new ConflictError('Ticket must be OPEN to update its order type');
  }
  const updated = (await ctx.prisma.ticket.update({
    ...query,
    where: { id: input.ticketId },
    data: { orderType: input.orderType },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'ticket.order_type_updated',
    resourceType: 'ticket',
    resourceId: updated.id,
    metadata: { orderType: input.orderType },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: updated.id,
  });
  return updated;
}

builder.mutationField('updateTicketOrderType', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { staff: true },
    args: { input: t.arg({ type: UpdateTicketOrderTypeInput, required: true }) },
    validate: { schema: z.object({ input: updateTicketOrderTypeSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateTicketOrderType(
        query,
        args.input as UpdateTicketOrderTypeArgs,
        ctx,
      ) as never,
  }),
);
