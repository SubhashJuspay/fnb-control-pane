import { addItemToMenuSectionSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { AddItemToMenuSectionInput } from './inputs.js';

export interface AddItemToMenuSectionArgs {
  menuSectionId: string;
  menuItemId: string;
  priceOverrideCents?: number | null;
}

export async function resolveAddItemToMenuSection(
  query: object,
  input: AddItemToMenuSectionArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can add items to menu sections');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;
  const section = await ctx.prisma.menuSection.findFirst({
    where: { id: input.menuSectionId, menu: { locationId } },
    select: { id: true },
  });
  if (!section) throw new NotFoundError('Menu section not found');
  const item = await ctx.prisma.menuItem.findFirst({
    where: { id: input.menuItemId, tenantId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError('Menu item not found');
  const last = await ctx.prisma.menuSectionItem.findFirst({
    where: { menuSectionId: input.menuSectionId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = last ? last.sortOrder + 1 : 0;
  try {
    const created = (await ctx.prisma.menuSectionItem.create({
      ...query,
      data: {
        menuSectionId: input.menuSectionId,
        menuItemId: input.menuItemId,
        priceOverrideCents: input.priceOverrideCents ?? null,
        sortOrder,
      },
    })) as { id: string };
    await writeAudit(ctx, {
      action: 'menu.section.item_added',
      resourceType: 'menu_section_item',
      resourceId: created.id,
      metadata: { menuSectionId: input.menuSectionId, menuItemId: input.menuItemId },
    });
    return created;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      throw new ConflictError('Item is already in this section');
    }
    throw err;
  }
}

builder.mutationField('addItemToMenuSection', (t) =>
  t.prismaField({
    type: 'MenuSectionItem',
    authScopes: { manager: true },
    args: { input: t.arg({ type: AddItemToMenuSectionInput, required: true }) },
    validate: { schema: z.object({ input: addItemToMenuSectionSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveAddItemToMenuSection(
        query,
        args.input as AddItemToMenuSectionArgs,
        ctx,
      ) as never,
  }),
);
