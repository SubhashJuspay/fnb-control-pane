import { archiveMenuSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveMenuInput } from './inputs.js';

export interface ArchiveMenuArgs {
  id: string;
}

export async function resolveArchiveMenu(
  query: object,
  input: ArchiveMenuArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can archive menus');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.menu.findFirst({
    where: { id: input.id, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Menu not found');
  const updated = (await ctx.prisma.menu.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date(), isActive: false },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'menu.archived',
    resourceType: 'menu',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveMenu', (t) =>
  t.prismaField({
    type: 'Menu',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ArchiveMenuInput, required: true }) },
    validate: { schema: z.object({ input: archiveMenuSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveMenu(query, args.input as ArchiveMenuArgs, ctx) as never,
  }),
);
