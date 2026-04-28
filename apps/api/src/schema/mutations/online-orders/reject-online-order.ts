import { rejectOnlineOrderSchema } from '@repo/validation/online-order';
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
import { RejectOnlineOrderInput } from './inputs.js';

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export interface RejectOnlineOrderArgs {
  id: string;
  rejectReason: string;
}

export async function resolveRejectOnlineOrder(
  query: object,
  input: RejectOnlineOrderArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can reject online orders');
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
      `Cannot reject a request with status ${request.confirmStatus}`,
    );
  }

  const now = new Date();
  const items = (await ctx.prisma.ticketItem.findMany({
    where: { ticketId: request.ticketId, voidedAt: null },
    select: { id: true },
  })) as Array<{ id: string }>;

  const updated = await ctx.prisma.$transaction(async (tx) => {
    await tx.ticketItem.updateMany({
      where: { ticketId: request.ticketId, voidedAt: null },
      data: {
        status: 'VOIDED',
        voidedById: userId,
        voidedAt: now,
        voidReason: 'Online order rejected',
      },
    });
    await tx.ticket.update({
      where: { id: request.ticketId },
      data: {
        status: 'VOIDED',
        voidedById: userId,
        voidedAt: now,
        voidReason: 'Online order rejected',
      },
    });
    return (await tx.onlineOrderRequest.update({
      ...query,
      where: { id: request.id },
      data: {
        confirmStatus: 'REJECTED',
        rejectedAt: now,
        rejectedById: userId,
        rejectReason: input.rejectReason,
      },
    })) as { id: string };
  });

  await writeAudit(ctx, {
    action: 'online_order.rejected',
    resourceType: 'online_order_request',
    resourceId: updated.id,
    metadata: {
      ticketId: request.ticketId,
      rejectReason: input.rejectReason,
      voidedItemCount: items.length,
    },
  });
  await writeAudit(ctx, {
    action: 'ticket.voided',
    resourceType: 'ticket',
    resourceId: request.ticketId,
    metadata: { reason: 'Online order rejected' },
  });
  for (const item of items) {
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

builder.mutationField('rejectOnlineOrder', (t) =>
  t.prismaField({
    type: 'OnlineOrderRequest',
    authScopes: { manager: true },
    description: 'Reject a PENDING online order. Voids the linked ticket and items.',
    args: { input: t.arg({ type: RejectOnlineOrderInput, required: true }) },
    validate: { schema: z.object({ input: rejectOnlineOrderSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveRejectOnlineOrder(
        query,
        args.input as RejectOnlineOrderArgs,
        ctx,
      ) as never,
  }),
);
