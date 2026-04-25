import { createCategorySchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateCategoryInput } from './inputs.js';

export interface CreateCategoryArgs {
  name: string;
  slug: string;
  sortOrder?: number | null;
}

export async function resolveCreateCategory(
  query: object,
  input: CreateCategoryArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can create categories');
  }
  const tenantId = ctx.auth.tenant.id;
  const existing = await ctx.prisma.category.findFirst({
    where: { tenantId, slug: input.slug },
    select: { id: true },
  });
  if (existing) throw new ConflictError('A category with that slug already exists');
  const created = (await ctx.prisma.category.create({
    ...query,
    data: {
      tenantId,
      name: input.name,
      slug: input.slug,
      sortOrder: input.sortOrder ?? 0,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.category.created',
    resourceType: 'category',
    resourceId: created.id,
  });
  return created;
}

builder.mutationField('createCategory', (t) =>
  t.prismaField({
    type: 'Category',
    authScopes: { admin: true },
    args: { input: t.arg({ type: CreateCategoryInput, required: true }) },
    validate: { schema: z.object({ input: createCategorySchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateCategory(query, args.input as CreateCategoryArgs, ctx) as never,
  }),
);
