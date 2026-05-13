import { refundTicketSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { RefundTicketInput } from './inputs.js';

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export interface RefundTicketArgs {
  ticketId: string;
  amountCents: number;
  reason: string;
}

/**
 * Pure helper: validate that a refund amount fits inside what's left to refund.
 * Returns the new cumulative refund total. Refunds are additive — staff can
 * issue a partial refund now and another later (capped at totalCents+tipCents).
 */
export function nextRefundCumulative(args: {
  totalCents: number;
  tipCents: number;
  alreadyRefunded: number;
  amountCents: number;
}): number {
  const cap = args.totalCents + args.tipCents;
  const next = args.alreadyRefunded + args.amountCents;
  if (next > cap) {
    throw new ConflictError(
      `Refund of ${args.amountCents}¢ exceeds remaining refundable amount (${cap - args.alreadyRefunded}¢)`,
    );
  }
  return next;
}

export async function resolveRefundTicket(
  query: object,
  input: RefundTicketArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can refund tickets');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: {
      id: true,
      status: true,
      totalCents: true,
      tipCents: true,
      refundCents: true,
    },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.status !== 'CLOSED') {
    throw new ConflictError(
      `Cannot refund a ticket with status ${ticket.status}; close it first`,
    );
  }

  const newRefundCents = nextRefundCumulative({
    totalCents: ticket.totalCents,
    tipCents: ticket.tipCents,
    alreadyRefunded: ticket.refundCents,
    amountCents: input.amountCents,
  });

  const now = new Date();
  const updated = (await ctx.prisma.ticket.update({
    ...query,
    where: { id: ticket.id },
    data: {
      refundCents: newRefundCents,
      // Keep the most recent reason + actor + timestamp. Audit log keeps
      // the full sequence of partial-refund history.
      refundReason: input.reason,
      refundedAt: now,
      refundedById: ctx.auth.user.id,
    },
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'ticket.refunded',
    resourceType: 'ticket',
    resourceId: updated.id,
    metadata: {
      amountCents: input.amountCents,
      cumulativeRefundCents: newRefundCents,
      reason: input.reason,
    },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: updated.id,
  });
  return updated;
}

builder.mutationField('refundTicket', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { manager: true },
    description:
      'Refund all or part of a CLOSED ticket. Additive — multiple partial refunds allowed up to total + tip.',
    args: { input: t.arg({ type: RefundTicketInput, required: true }) },
    validate: { schema: z.object({ input: refundTicketSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveRefundTicket(query, args.input as RefundTicketArgs, ctx) as never,
  }),
);
