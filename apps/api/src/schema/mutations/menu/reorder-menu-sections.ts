import { reorderMenuSectionsSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ReorderMenuSectionsInput } from './inputs.js';

export interface ReorderMenuSectionsArgs {
  menuId: string;
  orderedIds: string[];
}

export async function resolveReorderMenuSections(
  input: ReorderMenuSectionsArgs,
  ctx: RequestContext,
): Promise<{ ids: string[] }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can reorder menu sections');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const menu = await ctx.prisma.menu.findFirst({
    where: { id: input.menuId, locationId },
    select: { id: true },
  });
  if (!menu) throw new NotFoundError('Menu not found');
  const rows = await ctx.prisma.menuSection.findMany({
    where: { id: { in: input.orderedIds }, menuId: input.menuId },
    select: { id: true },
  });
  if (rows.length !== input.orderedIds.length) {
    throw new NotFoundError('One or more menu sections not found');
  }
  await ctx.prisma.$transaction(
    input.orderedIds.map((id, idx) =>
      ctx.prisma.menuSection.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );
  await writeAudit(ctx, {
    action: 'menu.section.updated',
    resourceType: 'menu_section',
    metadata: { menuId: input.menuId, reordered: input.orderedIds },
  });
  return { ids: input.orderedIds };
}

const ReorderMenuSectionsResult = builder.objectRef<{ ids: string[] }>(
  'ReorderMenuSectionsResult',
);
ReorderMenuSectionsResult.implement({
  description: 'Result of reordering menu sections.',
  fields: (t) => ({
    ids: t.field({ type: ['ID'], resolve: (parent) => parent.ids }),
  }),
});

builder.mutationField('reorderMenuSections', (t) =>
  t.field({
    type: ReorderMenuSectionsResult,
    authScopes: { manager: true },
    args: { input: t.arg({ type: ReorderMenuSectionsInput, required: true }) },
    validate: { schema: z.object({ input: reorderMenuSectionsSchema }) },
    resolve: (_root, args, ctx) =>
      resolveReorderMenuSections(args.input as ReorderMenuSectionsArgs, ctx),
  }),
);
