import { voidTicketSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { canTransitionTicket } from '../../../order/state.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { VoidTicketInput } from './inputs.js';

export interface VoidTicketArgs {
  ticketId: string;
  voidReason: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveVoidTicket(
  query: object,
  input: VoidTicketArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can void tickets');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;
  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: { id: true, status: true },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!canTransitionTicket(ticket.status, 'VOIDED')) {
    throw new ConflictError(`Cannot void a ticket with status ${ticket.status}`);
  }
  const voidedAt = new Date();
  const updated = (await ctx.prisma.$transaction(async (tx) => {
    // Cascade-void non-served items.
    await tx.ticketItem.updateMany({
      where: {
        ticketId: ticket.id,
        status: { in: ['NEW', 'FIRED', 'READY'] },
      },
      data: {
        status: 'VOIDED',
        voidedById: userId,
        voidedAt,
        voidReason: input.voidReason,
      },
    });
    return tx.ticket.update({
      ...query,
      where: { id: ticket.id },
      data: {
        status: 'VOIDED',
        voidedById: userId,
        voidedAt,
        voidReason: input.voidReason,
        subtotalCents: 0,
        discountCents: 0,
        taxCents: 0,
        totalCents: 0,
      },
    });
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'ticket.voided',
    resourceType: 'ticket',
    resourceId: updated.id,
    metadata: { voidReason: input.voidReason },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: updated.id,
  });
  return updated;
}

builder.mutationField('voidTicket', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { staff: true },
    args: { input: t.arg({ type: VoidTicketInput, required: true }) },
    validate: { schema: z.object({ input: voidTicketSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveVoidTicket(query, args.input as VoidTicketArgs, ctx) as never,
  }),
);
