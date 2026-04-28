import { fireTicketSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { FireTicketInput } from './inputs.js';

export interface FireTicketArgs {
  ticketId: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveFireTicket(
  query: object,
  input: FireTicketArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can fire tickets');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: { id: true, status: true },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.status !== 'OPEN') {
    throw new ConflictError('Ticket must be OPEN to fire items');
  }

  const newItems = (await ctx.prisma.ticketItem.findMany({
    where: { ticketId: ticket.id, status: 'NEW' },
    select: { id: true },
  })) as Array<{ id: string }>;
  if (newItems.length === 0) {
    throw new ConflictError('Nothing to fire');
  }
  const firedAt = new Date();
  await ctx.prisma.$transaction(async (tx) => {
    await tx.ticketItem.updateMany({
      where: { id: { in: newItems.map((i) => i.id) } },
      data: { status: 'FIRED', firedById: userId, firedAt },
    });
  });
  // Per-item audit (one row per fired item).
  for (const it of newItems) {
    await writeAudit(ctx, {
      action: 'ticket_item.fired',
      resourceType: 'ticket_item',
      resourceId: it.id,
      metadata: { ticketId: ticket.id, bulk: true, firedAt },
    });
    await pubsub.publish(ticketChannelName(locationId), {
      kind: 'TicketItemChanged',
      ticketId: ticket.id,
      ticketItemId: it.id,
    });
  }
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: ticket.id,
  });
  return ctx.prisma.ticket.findUnique({
    ...query,
    where: { id: ticket.id },
  });
}

builder.mutationField('fireTicket', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { staff: true },
    args: { input: t.arg({ type: FireTicketInput, required: true }) },
    validate: { schema: z.object({ input: fireTicketSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveFireTicket(query, args.input as FireTicketArgs, ctx) as never,
  }),
);
