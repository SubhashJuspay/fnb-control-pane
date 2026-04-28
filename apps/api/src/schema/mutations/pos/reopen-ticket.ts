import { reopenTicketSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { canTransitionTicket } from '../../../order/state.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ReopenTicketInput } from './inputs.js';

export interface ReopenTicketArgs {
  ticketId: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveReopenTicket(
  query: object,
  input: ReopenTicketArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can reopen tickets');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: { id: true, status: true },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!canTransitionTicket(ticket.status, 'OPEN')) {
    throw new ConflictError(`Cannot reopen a ticket with status ${ticket.status}`);
  }
  const updated = (await ctx.prisma.ticket.update({
    ...query,
    where: { id: ticket.id },
    data: {
      status: 'OPEN',
      closedAt: null,
      closedById: null,
      closeNote: null,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'ticket.reopened',
    resourceType: 'ticket',
    resourceId: updated.id,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: updated.id,
  });
  return updated;
}

builder.mutationField('reopenTicket', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ReopenTicketInput, required: true }) },
    validate: { schema: z.object({ input: reopenTicketSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveReopenTicket(query, args.input as ReopenTicketArgs, ctx) as never,
  }),
);
