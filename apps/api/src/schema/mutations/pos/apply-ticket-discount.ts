import { applyTicketDiscountSchema } from '@repo/validation/discount';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ApplyTicketDiscountInput } from './inputs.js';
import { recomputeTicketTotalsLive } from './recompute-totals.js';

export interface ApplyTicketDiscountArgs {
  ticketId: string;
  kind: 'FLAT' | 'PERCENT';
  amountCents?: number | null;
  percentBp?: number | null;
  reason: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

/**
 * Pure helper: compute the `computedCents` for a ticket-level discount.
 * Throws ConflictError when the FLAT amount exceeds available subtotal.
 */
export function computeTicketDiscountCents(args: {
  kind: 'FLAT' | 'PERCENT';
  amountCents?: number | null;
  percentBp?: number | null;
  ticketSubtotalCents: number;
  existingLineDiscountTotal: number;
  existingTicketDiscountTotal: number;
}): number {
  const availableForFlat =
    args.ticketSubtotalCents -
    args.existingLineDiscountTotal -
    args.existingTicketDiscountTotal;
  if (args.kind === 'FLAT') {
    const amt = args.amountCents ?? 0;
    if (amt > availableForFlat) {
      throw new ConflictError(
        `Discount amount (${amt}) exceeds available ticket subtotal (${availableForFlat})`,
      );
    }
    return amt;
  }
  const bp = args.percentBp ?? 0;
  const base = args.ticketSubtotalCents - args.existingLineDiscountTotal;
  return Math.round((Math.max(0, base) * bp) / 10_000);
}

export async function resolveApplyTicketDiscount(
  query: object,
  input: ApplyTicketDiscountArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can apply ticket discounts');
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
    throw new ConflictError('Ticket must be OPEN to apply a discount');
  }

  // Compute current subtotal (live, non-voided items) and existing discount totals.
  const items = (await ctx.prisma.ticketItem.findMany({
    where: { ticketId: ticket.id, status: { not: 'VOIDED' } },
    select: { lineSubtotalCents: true },
  })) as Array<{ lineSubtotalCents: number }>;
  const subtotalCents = items.reduce((acc, i) => acc + i.lineSubtotalCents, 0);

  const existing = (await ctx.prisma.discount.findMany({
    where: {
      voidedAt: null,
      OR: [
        { ticketId: ticket.id },
        { ticketItem: { ticketId: ticket.id } },
      ],
    },
    select: { ticketId: true, ticketItemId: true, computedCents: true },
  })) as Array<{
    ticketId: string | null;
    ticketItemId: string | null;
    computedCents: number;
  }>;
  let existingLineDiscountTotal = 0;
  let existingTicketDiscountTotal = 0;
  for (const d of existing) {
    if (d.ticketItemId) existingLineDiscountTotal += d.computedCents;
    else if (d.ticketId) existingTicketDiscountTotal += d.computedCents;
  }

  const computedCents = computeTicketDiscountCents({
    kind: input.kind,
    amountCents: input.amountCents ?? null,
    percentBp: input.percentBp ?? null,
    ticketSubtotalCents: subtotalCents,
    existingLineDiscountTotal,
    existingTicketDiscountTotal,
  });

  const created = (await ctx.prisma.discount.create({
    ...query,
    data: {
      locationId,
      ticketId: ticket.id,
      ticketItemId: null,
      kind: input.kind,
      amountCents: input.amountCents ?? null,
      percentBp: input.percentBp ?? null,
      computedCents,
      reason: input.reason,
      appliedById: userId,
    },
  })) as { id: string };

  await recomputeTicketTotalsLive({ prisma: ctx.prisma, ticketId: ticket.id });
  await writeAudit(ctx, {
    action: 'discount.ticket.applied',
    resourceType: 'discount',
    resourceId: created.id,
    metadata: {
      ticketId: ticket.id,
      kind: input.kind,
      computedCents,
      reason: input.reason,
    },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'DiscountChanged',
    ticketId: ticket.id,
    discountId: created.id,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: ticket.id,
  });
  return created;
}

builder.mutationField('applyTicketDiscount', (t) =>
  t.prismaField({
    type: 'Discount',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ApplyTicketDiscountInput, required: true }) },
    validate: { schema: z.object({ input: applyTicketDiscountSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveApplyTicketDiscount(
        query,
        args.input as ApplyTicketDiscountArgs,
        ctx,
      ) as never,
  }),
);
