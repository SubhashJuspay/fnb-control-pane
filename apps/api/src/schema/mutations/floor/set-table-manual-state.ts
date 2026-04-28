import { setTableManualStateSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { SetTableManualStateInput } from './inputs.js';

export interface SetTableManualStateArgs {
  tableId: string;
  manualState: 'NONE' | 'CLEANING';
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveSetTableManualState(
  query: object,
  input: SetTableManualStateArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can change table manual state');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.table.findFirst({
    where: { id: input.tableId, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Table not found');
  const updated = (await ctx.prisma.table.update({
    ...query,
    where: { id: input.tableId },
    data: { manualState: input.manualState },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'table.manual_state_set',
    resourceType: 'table',
    resourceId: updated.id,
    metadata: { manualState: input.manualState },
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'TableChanged',
    tableId: updated.id,
  });
  return updated;
}

builder.mutationField('setTableManualState', (t) =>
  t.prismaField({
    type: 'Table',
    authScopes: { staff: true },
    args: { input: t.arg({ type: SetTableManualStateInput, required: true }) },
    validate: { schema: z.object({ input: setTableManualStateSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveSetTableManualState(query, args.input as SetTableManualStateArgs, ctx) as never,
  }),
);
