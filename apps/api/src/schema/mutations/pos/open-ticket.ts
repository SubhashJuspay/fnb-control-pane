import { openTicketSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { computeBusinessDay, nextShortNumber } from '../../../order/short-number.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { OpenTicketInput } from './inputs.js';

export interface OpenTicketArgs {
  customerLabel?: string | null;
  orderType?: 'DINE_IN' | 'TAKEOUT' | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

/**
 * Pure resolver for `Mutation.openTicket`. Computes the (locationId,
 * businessDay, shortNumber) tuple inside a transaction and retries up to
 * three times if a concurrent insert wins the unique race.
 */
export async function resolveOpenTicket(
  query: object,
  input: OpenTicketArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can open tickets');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const location = await ctx.prisma.location.findUnique({
    where: { id: locationId },
    select: { businessDayCutoff: true, timezone: true },
  });
  if (!location) throw new ForbiddenError('Location not found');

  const at = new Date();
  const businessDay = computeBusinessDay({
    at,
    businessDayCutoff: location.businessDayCutoff,
    timezone: location.timezone,
  });
  const orderType = input.orderType ?? 'DINE_IN';
  const customerLabel = input.customerLabel ?? null;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const shortNumber = await nextShortNumber({
      prisma: ctx.prisma,
      locationId,
      businessDay,
    });
    try {
      const created = (await ctx.prisma.ticket.create({
        ...query,
        data: {
          locationId,
          shortNumber,
          businessDay,
          customerLabel,
          orderType,
          status: 'OPEN',
          openedById: userId,
          subtotalCents: 0,
          discountCents: 0,
          taxCents: 0,
          totalCents: 0,
        },
      })) as { id: string };
      await writeAudit(ctx, {
        action: 'ticket.opened',
        resourceType: 'ticket',
        resourceId: created.id,
        metadata: { shortNumber, businessDay, customerLabel, orderType },
      });
      await pubsub.publish(ticketChannelName(locationId), {
        kind: 'TicketChanged',
        ticketId: created.id,
      });
      return created;
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string }).code;
      if (code !== 'P2002') break;
    }
  }
  throw new ConflictError(
    `Failed to allocate a unique ticket number after retries: ${String(lastError)}`,
  );
}

builder.mutationField('openTicket', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { staff: true },
    args: { input: t.arg({ type: OpenTicketInput, required: true }) },
    validate: { schema: z.object({ input: openTicketSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveOpenTicket(query, args.input as OpenTicketArgs, ctx) as never,
  }),
);
