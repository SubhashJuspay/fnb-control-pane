import { removeItemFromMenuSectionSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { RemoveItemFromMenuSectionInput } from './inputs.js';

export interface RemoveItemFromMenuSectionArgs {
  id: string;
}

export async function resolveRemoveItemFromMenuSection(
  input: RemoveItemFromMenuSectionArgs,
  ctx: RequestContext,
): Promise<{ id: string }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can remove items from menu sections');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.menuSectionItem.findFirst({
    where: { id: input.id, menuSection: { menu: { locationId } } },
    select: { id: true, menuSectionId: true, menuItemId: true },
  });
  if (!existing) throw new NotFoundError('Menu section item not found');
  await ctx.prisma.menuSectionItem.delete({ where: { id: input.id } });
  await writeAudit(ctx, {
    action: 'menu.section.item_removed',
    resourceType: 'menu_section_item',
    resourceId: existing.id,
    metadata: {
      menuSectionId: existing.menuSectionId,
      menuItemId: existing.menuItemId,
    },
  });
  return { id: existing.id };
}

const RemoveItemFromMenuSectionResult = builder.objectRef<{ id: string }>(
  'RemoveItemFromMenuSectionResult',
);
RemoveItemFromMenuSectionResult.implement({
  description: 'Result of removing an item from a menu section.',
  fields: (t) => ({
    id: t.exposeID('id'),
  }),
});

builder.mutationField('removeItemFromMenuSection', (t) =>
  t.field({
    type: RemoveItemFromMenuSectionResult,
    authScopes: { manager: true },
    args: { input: t.arg({ type: RemoveItemFromMenuSectionInput, required: true }) },
    validate: { schema: z.object({ input: removeItemFromMenuSectionSchema }) },
    resolve: (_root, args, ctx) =>
      resolveRemoveItemFromMenuSection(
        args.input as RemoveItemFromMenuSectionArgs,
        ctx,
      ),
  }),
);
