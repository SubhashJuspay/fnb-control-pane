import { reorderCategoriesSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ReorderCategoriesInput } from './inputs.js';

export interface ReorderCategoriesArgs {
  orderedIds: string[];
}

export async function resolveReorderCategories(
  input: ReorderCategoriesArgs,
  ctx: RequestContext,
): Promise<{ ids: string[] }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can reorder categories');
  }
  const tenantId = ctx.auth.tenant.id;
  const rows = await ctx.prisma.category.findMany({
    where: { id: { in: input.orderedIds }, tenantId },
    select: { id: true },
  });
  if (rows.length !== input.orderedIds.length) {
    throw new NotFoundError('One or more categories not found');
  }
  await ctx.prisma.$transaction(
    input.orderedIds.map((id, idx) =>
      ctx.prisma.category.update({
        where: { id },
        data: { sortOrder: idx },
      }),
    ),
  );
  await writeAudit(ctx, {
    action: 'catalog.category.updated',
    resourceType: 'category',
    metadata: { reordered: input.orderedIds },
  });
  return { ids: input.orderedIds };
}

const ReorderCategoriesResult = builder.objectRef<{ ids: string[] }>('ReorderCategoriesResult');
ReorderCategoriesResult.implement({
  description: 'Result of reordering categories — list of ids in new order.',
  fields: (t) => ({
    ids: t.field({ type: ['ID'], resolve: (parent) => parent.ids }),
  }),
});

builder.mutationField('reorderCategories', (t) =>
  t.field({
    type: ReorderCategoriesResult,
    authScopes: { admin: true },
    args: { input: t.arg({ type: ReorderCategoriesInput, required: true }) },
    validate: { schema: z.object({ input: reorderCategoriesSchema }) },
    resolve: (_root, args, ctx) =>
      resolveReorderCategories(args.input as ReorderCategoriesArgs, ctx),
  }),
);
