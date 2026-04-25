import { reorderModifiersSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ReorderModifiersInput } from './inputs.js';

export interface ReorderModifiersArgs {
  modifierGroupId: string;
  orderedIds: string[];
}

export async function resolveReorderModifiers(
  input: ReorderModifiersArgs,
  ctx: RequestContext,
): Promise<{ ids: string[] }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can reorder modifiers');
  }
  const group = await ctx.prisma.modifierGroup.findFirst({
    where: { id: input.modifierGroupId, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!group) throw new NotFoundError('Modifier group not found');
  const rows = await ctx.prisma.modifier.findMany({
    where: { id: { in: input.orderedIds }, modifierGroupId: input.modifierGroupId },
    select: { id: true },
  });
  if (rows.length !== input.orderedIds.length) {
    throw new NotFoundError('One or more modifiers not found in this group');
  }
  await ctx.prisma.$transaction(
    input.orderedIds.map((id, idx) =>
      ctx.prisma.modifier.update({
        where: { id },
        data: { sortOrder: idx },
      }),
    ),
  );
  await writeAudit(ctx, {
    action: 'catalog.modifier.updated',
    resourceType: 'modifier_group',
    resourceId: input.modifierGroupId,
    metadata: { reordered: input.orderedIds },
  });
  return { ids: input.orderedIds };
}

const ReorderModifiersResult = builder.objectRef<{ ids: string[] }>('ReorderModifiersResult');
ReorderModifiersResult.implement({
  description: 'Result of reordering modifiers — list of ids in new order.',
  fields: (t) => ({
    ids: t.field({ type: ['ID'], resolve: (parent) => parent.ids }),
  }),
});

builder.mutationField('reorderModifiers', (t) =>
  t.field({
    type: ReorderModifiersResult,
    authScopes: { admin: true },
    args: { input: t.arg({ type: ReorderModifiersInput, required: true }) },
    validate: { schema: z.object({ input: reorderModifiersSchema }) },
    resolve: (_root, args, ctx) =>
      resolveReorderModifiers(args.input as ReorderModifiersArgs, ctx),
  }),
);
