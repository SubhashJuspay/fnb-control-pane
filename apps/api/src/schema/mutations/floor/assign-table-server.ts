import { assignTableServerSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { AssignTableServerInput } from './inputs.js';

export interface AssignTableServerArgs {
  tableId: string;
  assignedServerId: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveAssignTableServer(
  query: object,
  input: AssignTableServerArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can assign servers to tables');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;

  const existing = await ctx.prisma.table.findFirst({
    where: { id: input.tableId, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Table not found');

  if (input.assignedServerId) {
    const membership = await ctx.prisma.membership.findFirst({
      where: {
        userId: input.assignedServerId,
        tenantId,
        status: 'ACTIVE',
        OR: [{ locationId }, { locationId: null }],
      },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundError('Server is not an active member of this location');
    }
  }

  const updated = (await ctx.prisma.table.update({
    ...query,
    where: { id: input.tableId },
    data: { assignedServerId: input.assignedServerId },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'table.server_assigned',
    resourceType: 'table',
    resourceId: updated.id,
    metadata: { assignedServerId: input.assignedServerId },
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'TableChanged',
    tableId: updated.id,
  });
  return updated;
}

builder.mutationField('assignTableServer', (t) =>
  t.prismaField({
    type: 'Table',
    authScopes: { manager: true },
    args: { input: t.arg({ type: AssignTableServerInput, required: true }) },
    validate: { schema: z.object({ input: assignTableServerSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveAssignTableServer(query, args.input as AssignTableServerArgs, ctx) as never,
  }),
);
