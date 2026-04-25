import { updateMenuItemSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateMenuItemInput } from './inputs.js';

export interface UpdateMenuItemArgs {
  id: string;
  name?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  basePriceCents?: number | null;
  imageUrl?: string | null;
  course?: string | null;
  printerStation?: string | null;
  categoryId?: string | null;
  taxCategoryId?: string | null;
  dietaryTags?: string[] | null;
  allergenTags?: string[] | null;
}

export async function resolveUpdateMenuItem(
  query: object,
  input: UpdateMenuItemArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can update menu items');
  }
  const tenantId = ctx.auth.tenant.id;
  const existing = await ctx.prisma.menuItem.findFirst({
    where: { id: input.id, tenantId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Menu item not found');
  if (input.categoryId !== undefined && input.categoryId !== null) {
    const cat = await ctx.prisma.category.findFirst({
      where: { id: input.categoryId, tenantId },
      select: { id: true },
    });
    if (!cat) throw new NotFoundError('Category not found');
  }
  if (input.taxCategoryId !== undefined && input.taxCategoryId !== null) {
    const tax = await ctx.prisma.taxCategory.findFirst({
      where: { id: input.taxCategoryId, tenantId },
      select: { id: true },
    });
    if (!tax) throw new NotFoundError('Tax category not found');
  }
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.shortDescription !== undefined) data.shortDescription = input.shortDescription;
  if (input.description !== undefined) data.description = input.description;
  if (input.basePriceCents !== undefined && input.basePriceCents !== null)
    data.basePriceCents = input.basePriceCents;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.course !== undefined && input.course !== null) data.course = input.course;
  if (input.printerStation !== undefined) data.printerStation = input.printerStation;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.taxCategoryId !== undefined && input.taxCategoryId !== null)
    data.taxCategoryId = input.taxCategoryId;
  if (input.dietaryTags !== undefined && input.dietaryTags !== null)
    data.dietaryTags = input.dietaryTags;
  if (input.allergenTags !== undefined && input.allergenTags !== null)
    data.allergenTags = input.allergenTags;
  const updated = (await ctx.prisma.menuItem.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.item.updated',
    resourceType: 'menu_item',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('updateMenuItem', (t) =>
  t.prismaField({
    type: 'MenuItem',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UpdateMenuItemInput, required: true }) },
    validate: { schema: z.object({ input: updateMenuItemSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateMenuItem(query, args.input as UpdateMenuItemArgs, ctx) as never,
  }),
);
