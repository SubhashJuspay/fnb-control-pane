import { confirmOnlineOrderSchema } from '@repo/validation/online-order';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import {
  onlineOrdersChannelName,
  pubsub,
  ticketChannelName,
} from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ConfirmOnlineOrderInput } from './inputs.js';

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export interface ConfirmOnlineOrderArgs {
  id: string;
  estimatedReadyAt?: Date | null;
}

export async function resolveConfirmOnlineOrder(
  query: object,
  input: ConfirmOnlineOrderArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can confirm online orders');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const request = await ctx.prisma.onlineOrderRequest.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, ticketId: true, confirmStatus: true },
  });
  if (!request) throw new NotFoundError('Online order request not found');
  if (request.confirmStatus !== 'PENDING') {
    throw new ConflictError(
      `Cannot confirm a request with status ${request.confirmStatus}`,
    );
  }

  const now = new Date();
  const newItems = (await ctx.prisma.ticketItem.findMany({
    where: { ticketId: request.ticketId, status: 'NEW' },
    select: { id: true },
  })) as Array<{ id: string }>;

  const updated = await ctx.prisma.$transaction(async (tx) => {
    await tx.ticketItem.updateMany({
      where: { ticketId: request.ticketId, status: 'NEW' },
      data: { status: 'FIRED', firedById: userId, firedAt: now },
    });
    return (await tx.onlineOrderRequest.update({
      ...query,
      where: { id: request.id },
      data: {
        confirmStatus: 'CONFIRMED',
        confirmedAt: now,
        confirmedById: userId,
      },
    })) as { id: string };
  });

  await writeAudit(ctx, {
    action: 'online_order.confirmed',
    resourceType: 'online_order_request',
    resourceId: updated.id,
    metadata: { ticketId: request.ticketId, firedItemCount: newItems.length },
  });
  for (const item of newItems) {
    await writeAudit(ctx, {
      action: 'ticket_item.fired',
      resourceType: 'ticket_item',
      resourceId: item.id,
      metadata: { ticketId: request.ticketId },
    });
    await pubsub.publish(ticketChannelName(locationId), {
      kind: 'TicketItemChanged',
      ticketId: request.ticketId,
      ticketItemId: item.id,
    });
  }
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: request.ticketId,
  });
  await pubsub.publish(onlineOrdersChannelName(locationId), {
    kind: 'OnlineOrderRequestUpdated',
    requestId: updated.id,
  });
  return updated;
}

builder.mutationField('confirmOnlineOrder', (t) =>
  t.prismaField({
    type: 'OnlineOrderRequest',
    authScopes: { staff: true },
    description: 'Confirm a PENDING online order: fires all NEW items.',
    args: { input: t.arg({ type: ConfirmOnlineOrderInput, required: true }) },
    validate: { schema: z.object({ input: confirmOnlineOrderSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveConfirmOnlineOrder(
        query,
        args.input as ConfirmOnlineOrderArgs,
        ctx,
      ) as never,
  }),
);
