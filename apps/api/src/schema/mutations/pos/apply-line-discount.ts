import { applyLineDiscountSchema } from '@repo/validation/discount';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ApplyLineDiscountInput } from './inputs.js';
import { recomputeTicketTotalsLive } from './recompute-totals.js';

export interface ApplyLineDiscountArgs {
  ticketItemId: string;
  kind: 'FLAT' | 'PERCENT';
  amountCents?: number | null;
  percentBp?: number | null;
  reason: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

/**
 * Pure helper: compute `computedCents` for a line-level discount.
 * Throws ConflictError when FLAT exceeds remaining line subtotal.
 */
export function computeLineDiscountCents(args: {
  kind: 'FLAT' | 'PERCENT';
  amountCents?: number | null;
  percentBp?: number | null;
  lineSubtotalCents: number;
  existingLineDiscountTotal: number;
}): number {
  const remaining = args.lineSubtotalCents - args.existingLineDiscountTotal;
  if (args.kind === 'FLAT') {
    const amt = args.amountCents ?? 0;
    if (amt > remaining) {
      throw new ConflictError(
        `Discount amount (${amt}) exceeds remaining line subtotal (${remaining})`,
      );
    }
    return amt;
  }
  const bp = args.percentBp ?? 0;
  return Math.round((Math.max(0, remaining) * bp) / 10_000);
}

export async function resolveApplyLineDiscount(
  query: object,
  input: ApplyLineDiscountArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can apply line discounts');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const item = await ctx.prisma.ticketItem.findUnique({
    where: { id: input.ticketItemId },
    select: {
      id: true,
      status: true,
      lineSubtotalCents: true,
      ticketId: true,
      ticket: { select: { locationId: true, status: true } },
    },
  });
  if (!item) throw new NotFoundError('Ticket item not found');
  if (item.ticket.locationId !== locationId) {
    throw new ForbiddenError('Ticket item not found at this location');
  }
  if (item.ticket.status !== 'OPEN') {
    throw new ConflictError('Ticket must be OPEN to apply a discount');
  }
  if (item.status === 'VOIDED') {
    throw new ConflictError('Cannot apply a discount to a voided item');
  }

  const existing = (await ctx.prisma.discount.findMany({
    where: { ticketItemId: item.id, voidedAt: null },
    select: { computedCents: true },
  })) as Array<{ computedCents: number }>;
  const existingLineDiscountTotal = existing.reduce(
    (acc, d) => acc + d.computedCents,
    0,
  );

  const computedCents = computeLineDiscountCents({
    kind: input.kind,
    amountCents: input.amountCents ?? null,
    percentBp: input.percentBp ?? null,
    lineSubtotalCents: item.lineSubtotalCents,
    existingLineDiscountTotal,
  });

  const created = (await ctx.prisma.discount.create({
    ...query,
    data: {
      locationId,
      ticketId: null,
      ticketItemId: item.id,
      kind: input.kind,
      amountCents: input.amountCents ?? null,
      percentBp: input.percentBp ?? null,
      computedCents,
      reason: input.reason,
      appliedById: userId,
    },
  })) as { id: string };

  await recomputeTicketTotalsLive({ prisma: ctx.prisma, ticketId: item.ticketId });
  await writeAudit(ctx, {
    action: 'discount.line.applied',
    resourceType: 'discount',
    resourceId: created.id,
    metadata: {
      ticketItemId: item.id,
      ticketId: item.ticketId,
      kind: input.kind,
      computedCents,
      reason: input.reason,
    },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'DiscountChanged',
    ticketId: item.ticketId,
    discountId: created.id,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: item.ticketId,
  });
  return created;
}

builder.mutationField('applyLineDiscount', (t) =>
  t.prismaField({
    type: 'Discount',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ApplyLineDiscountInput, required: true }) },
    validate: { schema: z.object({ input: applyLineDiscountSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveApplyLineDiscount(
        query,
        args.input as ApplyLineDiscountArgs,
        ctx,
      ) as never,
  }),
);
