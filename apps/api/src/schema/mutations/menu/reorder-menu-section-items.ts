import { reorderMenuSectionItemsSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ReorderMenuSectionItemsInput } from './inputs.js';

export interface ReorderMenuSectionItemsArgs {
  menuSectionId: string;
  orderedIds: string[];
}

export async function resolveReorderMenuSectionItems(
  input: ReorderMenuSectionItemsArgs,
  ctx: RequestContext,
): Promise<{ ids: string[] }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can reorder menu section items');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const section = await ctx.prisma.menuSection.findFirst({
    where: { id: input.menuSectionId, menu: { locationId } },
    select: { id: true },
  });
  if (!section) throw new NotFoundError('Menu section not found');
  const rows = await ctx.prisma.menuSectionItem.findMany({
    where: { id: { in: input.orderedIds }, menuSectionId: input.menuSectionId },
    select: { id: true },
  });
  if (rows.length !== input.orderedIds.length) {
    throw new NotFoundError('One or more menu section items not found');
  }
  await ctx.prisma.$transaction(
    input.orderedIds.map((id, idx) =>
      ctx.prisma.menuSectionItem.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );
  await writeAudit(ctx, {
    action: 'menu.section.item_updated',
    resourceType: 'menu_section_item',
    metadata: { menuSectionId: input.menuSectionId, reordered: input.orderedIds },
  });
  return { ids: input.orderedIds };
}

const ReorderMenuSectionItemsResult = builder.objectRef<{ ids: string[] }>(
  'ReorderMenuSectionItemsResult',
);
ReorderMenuSectionItemsResult.implement({
  description: 'Result of reordering menu section items.',
  fields: (t) => ({
    ids: t.field({ type: ['ID'], resolve: (parent) => parent.ids }),
  }),
});

builder.mutationField('reorderMenuSectionItems', (t) =>
  t.field({
    type: ReorderMenuSectionItemsResult,
    authScopes: { manager: true },
    args: { input: t.arg({ type: ReorderMenuSectionItemsInput, required: true }) },
    validate: { schema: z.object({ input: reorderMenuSectionItemsSchema }) },
    resolve: (_root, args, ctx) =>
      resolveReorderMenuSectionItems(args.input as ReorderMenuSectionItemsArgs, ctx),
  }),
);
