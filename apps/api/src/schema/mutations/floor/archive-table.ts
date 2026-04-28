import { archiveTableSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ArchiveTableInput } from './inputs.js';

export interface ArchiveTableArgs {
  id: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveArchiveTable(
  query: object,
  input: ArchiveTableArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can archive tables');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.table.findFirst({
    where: { id: input.id, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Table not found');
  const updated = (await ctx.prisma.table.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'table.archived',
    resourceType: 'table',
    resourceId: updated.id,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'TableChanged',
    tableId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveTable', (t) =>
  t.prismaField({
    type: 'Table',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ArchiveTableInput, required: true }) },
    validate: { schema: z.object({ input: archiveTableSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveTable(query, args.input as ArchiveTableArgs, ctx) as never,
  }),
);
