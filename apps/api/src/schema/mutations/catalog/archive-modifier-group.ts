import { archiveModifierGroupSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveModifierGroupInput } from './inputs.js';

export interface ArchiveModifierGroupArgs {
  id: string;
}

export async function resolveArchiveModifierGroup(
  query: object,
  input: ArchiveModifierGroupArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can archive modifier groups');
  }
  const existing = await ctx.prisma.modifierGroup.findFirst({
    where: { id: input.id, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Modifier group not found');
  const updated = (await ctx.prisma.modifierGroup.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.modifier_group.archived',
    resourceType: 'modifier_group',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveModifierGroup', (t) =>
  t.prismaField({
    type: 'ModifierGroup',
    authScopes: { admin: true },
    args: { input: t.arg({ type: ArchiveModifierGroupInput, required: true }) },
    validate: { schema: z.object({ input: archiveModifierGroupSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveModifierGroup(query, args.input as ArchiveModifierGroupArgs, ctx) as never,
  }),
);
