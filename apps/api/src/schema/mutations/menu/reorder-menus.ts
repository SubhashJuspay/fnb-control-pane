import { reorderMenusSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ReorderMenusInput } from './inputs.js';

export interface ReorderMenusArgs {
  orderedIds: string[];
}

export async function resolveReorderMenus(
  input: ReorderMenusArgs,
  ctx: RequestContext,
): Promise<{ ids: string[] }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can reorder menus');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const rows = await ctx.prisma.menu.findMany({
    where: { id: { in: input.orderedIds }, locationId },
    select: { id: true },
  });
  if (rows.length !== input.orderedIds.length) {
    throw new NotFoundError('One or more menus not found');
  }
  await ctx.prisma.$transaction(
    input.orderedIds.map((id, idx) =>
      ctx.prisma.menu.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );
  await writeAudit(ctx, {
    action: 'menu.updated',
    resourceType: 'menu',
    metadata: { reordered: input.orderedIds },
  });
  return { ids: input.orderedIds };
}

const ReorderMenusResult = builder.objectRef<{ ids: string[] }>('ReorderMenusResult');
ReorderMenusResult.implement({
  description: 'Result of reordering menus — list of ids in new order.',
  fields: (t) => ({
    ids: t.field({ type: ['ID'], resolve: (parent) => parent.ids }),
  }),
});

builder.mutationField('reorderMenus', (t) =>
  t.field({
    type: ReorderMenusResult,
    authScopes: { manager: true },
    args: { input: t.arg({ type: ReorderMenusInput, required: true }) },
    validate: { schema: z.object({ input: reorderMenusSchema }) },
    resolve: (_root, args, ctx) =>
      resolveReorderMenus(args.input as ReorderMenusArgs, ctx),
  }),
);
