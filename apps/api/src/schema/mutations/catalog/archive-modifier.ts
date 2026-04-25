import { archiveModifierSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveModifierInput } from './inputs.js';

export interface ArchiveModifierArgs {
  id: string;
}

export async function resolveArchiveModifier(
  query: object,
  input: ArchiveModifierArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can archive modifiers');
  }
  const existing = await ctx.prisma.modifier.findFirst({
    where: {
      id: input.id,
      modifierGroup: { tenantId: ctx.auth.tenant.id },
    },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Modifier not found');
  const updated = (await ctx.prisma.modifier.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.modifier.archived',
    resourceType: 'modifier',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveModifier', (t) =>
  t.prismaField({
    type: 'Modifier',
    authScopes: { admin: true },
    args: { input: t.arg({ type: ArchiveModifierInput, required: true }) },
    validate: { schema: z.object({ input: archiveModifierSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveModifier(query, args.input as ArchiveModifierArgs, ctx) as never,
  }),
);
