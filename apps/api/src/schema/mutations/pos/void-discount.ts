import { voidDiscountSchema } from '@repo/validation/discount';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { VoidDiscountInput } from './inputs.js';
import { recomputeTicketTotalsLive } from './recompute-totals.js';

export interface VoidDiscountArgs {
  discountId: string;
  voidReason: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveVoidDiscount(
  query: object,
  input: VoidDiscountArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can void discounts');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const discount = await ctx.prisma.discount.findUnique({
    where: { id: input.discountId },
    select: {
      id: true,
      locationId: true,
      voidedAt: true,
      ticketId: true,
      ticketItemId: true,
      ticketItem: { select: { ticketId: true } },
    },
  });
  if (!discount) throw new NotFoundError('Discount not found');
  if (discount.locationId !== locationId) {
    throw new ForbiddenError('Discount not at this location');
  }
  if (discount.voidedAt !== null) {
    throw new ConflictError('Discount already voided');
  }

  const ticketId = discount.ticketId ?? discount.ticketItem?.ticketId ?? null;
  if (!ticketId) {
    throw new ConflictError('Discount has no ticket binding');
  }

  const updated = (await ctx.prisma.discount.update({
    ...query,
    where: { id: discount.id },
    data: {
      voidedAt: new Date(),
      voidedById: userId,
      voidReason: input.voidReason,
    },
  })) as { id: string };

  await recomputeTicketTotalsLive({ prisma: ctx.prisma, ticketId });
  await writeAudit(ctx, {
    action: 'discount.voided',
    resourceType: 'discount',
    resourceId: updated.id,
    metadata: { ticketId, voidReason: input.voidReason },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'DiscountChanged',
    ticketId,
    discountId: updated.id,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId,
  });
  return updated;
}

builder.mutationField('voidDiscount', (t) =>
  t.prismaField({
    type: 'Discount',
    authScopes: { manager: true },
    args: { input: t.arg({ type: VoidDiscountInput, required: true }) },
    validate: { schema: z.object({ input: voidDiscountSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveVoidDiscount(query, args.input as VoidDiscountArgs, ctx) as never,
  }),
);
