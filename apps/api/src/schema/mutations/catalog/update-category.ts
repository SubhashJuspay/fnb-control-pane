import { updateCategorySchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateCategoryInput } from './inputs.js';

export interface UpdateCategoryArgs {
  id: string;
  name?: string | null;
  slug?: string | null;
}

export async function resolveUpdateCategory(
  query: object,
  input: UpdateCategoryArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can update categories');
  }
  const tenantId = ctx.auth.tenant.id;
  const existing = await ctx.prisma.category.findFirst({
    where: { id: input.id, tenantId },
    select: { id: true, slug: true },
  });
  if (!existing) throw new NotFoundError('Category not found');
  if (input.slug !== undefined && input.slug !== null && input.slug !== existing.slug) {
    const conflict = await ctx.prisma.category.findFirst({
      where: { tenantId, slug: input.slug, NOT: { id: input.id } },
      select: { id: true },
    });
    if (conflict) throw new ConflictError('A category with that slug already exists');
  }
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.slug !== undefined && input.slug !== null) data.slug = input.slug;
  const updated = (await ctx.prisma.category.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.category.updated',
    resourceType: 'category',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('updateCategory', (t) =>
  t.prismaField({
    type: 'Category',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UpdateCategoryInput, required: true }) },
    validate: { schema: z.object({ input: updateCategorySchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateCategory(query, args.input as UpdateCategoryArgs, ctx) as never,
  }),
);
