import { createMenuItemSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateMenuItemInput } from './inputs.js';

export interface CreateMenuItemArgs {
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  basePriceCents: number;
  imageUrl?: string | null;
  course?: string | null;
  printerStation?: string | null;
  categoryId?: string | null;
  taxCategoryId: string;
  dietaryTags?: string[] | null;
  allergenTags?: string[] | null;
}

export async function resolveCreateMenuItem(
  query: object,
  input: CreateMenuItemArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can create menu items');
  }
  const tenantId = ctx.auth.tenant.id;
  if (input.categoryId) {
    const cat = await ctx.prisma.category.findFirst({
      where: { id: input.categoryId, tenantId },
      select: { id: true },
    });
    if (!cat) throw new NotFoundError('Category not found');
  }
  const tax = await ctx.prisma.taxCategory.findFirst({
    where: { id: input.taxCategoryId, tenantId },
    select: { id: true },
  });
  if (!tax) throw new NotFoundError('Tax category not found');
  const created = (await ctx.prisma.menuItem.create({
    ...query,
    data: {
      tenantId,
      categoryId: input.categoryId ?? null,
      taxCategoryId: input.taxCategoryId,
      name: input.name,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      basePriceCents: input.basePriceCents,
      imageUrl: input.imageUrl ?? null,
      course: (input.course ?? 'MAIN') as never,
      printerStation: input.printerStation ?? null,
      dietaryTags: input.dietaryTags ?? [],
      allergenTags: input.allergenTags ?? [],
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.item.created',
    resourceType: 'menu_item',
    resourceId: created.id,
  });
  return created;
}

builder.mutationField('createMenuItem', (t) =>
  t.prismaField({
    type: 'MenuItem',
    authScopes: { admin: true },
    args: { input: t.arg({ type: CreateMenuItemInput, required: true }) },
    validate: { schema: z.object({ input: createMenuItemSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateMenuItem(query, args.input as CreateMenuItemArgs, ctx) as never,
  }),
);
