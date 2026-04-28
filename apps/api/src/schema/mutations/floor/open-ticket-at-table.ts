import { openTicketAtTableSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { openTicketBoundToTable } from '../../../floor/open-ticket.js';
import {
  floorChannelName,
  pubsub,
  ticketChannelName,
} from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { OpenTicketAtTableInput } from './inputs.js';

export interface OpenTicketAtTableArgs {
  tableId: string;
  customerLabel?: string | null;
  partySize?: number | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveOpenTicketAtTable(
  query: object,
  input: OpenTicketAtTableArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can open tickets at tables');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');

  const result = await openTicketBoundToTable({
    prisma: ctx.prisma,
    ctx,
    tableId: input.tableId,
    customerLabel: input.customerLabel ?? null,
    orderType: 'DINE_IN',
  });

  await writeAudit(ctx, {
    action: 'ticket.opened_at_table',
    resourceType: 'ticket',
    resourceId: result.ticketId,
    metadata: {
      tableId: input.tableId,
      shortNumber: result.shortNumber,
      businessDay: result.businessDay,
      customerLabel: input.customerLabel ?? null,
      partySize: input.partySize ?? null,
    },
  });
  await pubsub.publish(ticketChannelName(result.locationId), {
    kind: 'TicketChanged',
    ticketId: result.ticketId,
  });
  await pubsub.publish(floorChannelName(result.locationId), {
    kind: 'TableChanged',
    tableId: input.tableId,
  });

  // Fetch the created ticket with the Pothos `query` selection so child fields
  // resolve in one trip.
  return ctx.prisma.ticket.findUniqueOrThrow({
    ...query,
    where: { id: result.ticketId },
  });
}

builder.mutationField('openTicketAtTable', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { staff: true },
    args: { input: t.arg({ type: OpenTicketAtTableInput, required: true }) },
    validate: { schema: z.object({ input: openTicketAtTableSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveOpenTicketAtTable(query, args.input as OpenTicketAtTableArgs, ctx) as never,
  }),
);
