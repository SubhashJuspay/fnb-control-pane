import { linkTicketGuestSchema } from '@repo/validation/guest';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { LinkTicketGuestInput } from './inputs.js';

export interface LinkTicketGuestArgs {
  ticketId: string;
  guestId?: string | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveLinkTicketGuest(
  query: object,
  input: LinkTicketGuestArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only staff or above can link a guest to a ticket');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;

  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: { id: true, openedAt: true, guestId: true },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');

  // null guestId = unlink.
  if (!input.guestId) {
    const updated = (await ctx.prisma.ticket.update({
      ...query,
      where: { id: ticket.id },
      data: { guestId: null },
    })) as { id: string };
    await writeAudit(ctx, {
      action: 'ticket.guest_unlinked',
      resourceType: 'ticket',
      resourceId: updated.id,
      metadata: { previousGuestId: ticket.guestId },
    });
    await pubsub.publish(ticketChannelName(locationId), {
      kind: 'TicketChanged',
      ticketId: updated.id,
    });
    return updated;
  }

  // Verify guest belongs to viewer's tenant.
  const guest = await ctx.prisma.guest.findFirst({
    where: { id: input.guestId, tenantId },
    select: { id: true, lastSeenAt: true },
  });
  if (!guest) throw new NotFoundError('Guest not found');

  const updated = (await ctx.prisma.ticket.update({
    ...query,
    where: { id: ticket.id },
    data: { guestId: guest.id },
  })) as { id: string };

  // Update Guest.lastSeenAt = MAX(ticket.openedAt, current lastSeenAt).
  const candidate = ticket.openedAt;
  if (
    !guest.lastSeenAt ||
    candidate.getTime() > guest.lastSeenAt.getTime()
  ) {
    await ctx.prisma.guest.update({
      where: { id: guest.id },
      data: { lastSeenAt: candidate },
    });
  }

  await writeAudit(ctx, {
    action: 'ticket.guest_linked',
    resourceType: 'ticket',
    resourceId: updated.id,
    metadata: { guestId: guest.id },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: updated.id,
  });
  return updated;
}

builder.mutationField('linkTicketGuest', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { staff: true },
    args: { input: t.arg({ type: LinkTicketGuestInput, required: true }) },
    validate: { schema: z.object({ input: linkTicketGuestSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveLinkTicketGuest(query, args.input as LinkTicketGuestArgs, ctx) as never,
  }),
);
