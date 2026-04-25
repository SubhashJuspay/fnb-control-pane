import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveCategoryInput } from './inputs.js';

export const archiveCategorySchema = z.object({ id: z.string().uuid() });

export interface ArchiveCategoryArgs {
  id: string;
}

export async function resolveArchiveCategory(
  query: object,
  input: ArchiveCategoryArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can archive categories');
  }
  const existing = await ctx.prisma.category.findFirst({
    where: { id: input.id, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Category not found');
  const updated = (await ctx.prisma.category.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.category.archived',
    resourceType: 'category',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveCategory', (t) =>
  t.prismaField({
    type: 'Category',
    authScopes: { admin: true },
    args: { input: t.arg({ type: ArchiveCategoryInput, required: true }) },
    validate: { schema: z.object({ input: archiveCategorySchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveCategory(query, args.input as ArchiveCategoryArgs, ctx) as never,
  }),
);
