import { updateModifierGroupSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateModifierGroupInput } from './inputs.js';

export interface UpdateModifierGroupArgs {
  id: string;
  name?: string | null;
  minSelections?: number | null;
  maxSelections?: number | null;
}

export async function resolveUpdateModifierGroup(
  query: object,
  input: UpdateModifierGroupArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can update modifier groups');
  }
  const existing = await ctx.prisma.modifierGroup.findFirst({
    where: { id: input.id, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Modifier group not found');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.minSelections !== undefined && input.minSelections !== null)
    data.minSelections = input.minSelections;
  if (input.maxSelections !== undefined && input.maxSelections !== null)
    data.maxSelections = input.maxSelections;
  const updated = (await ctx.prisma.modifierGroup.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.modifier_group.updated',
    resourceType: 'modifier_group',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('updateModifierGroup', (t) =>
  t.prismaField({
    type: 'ModifierGroup',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UpdateModifierGroupInput, required: true }) },
    validate: { schema: z.object({ input: updateModifierGroupSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateModifierGroup(query, args.input as UpdateModifierGroupArgs, ctx) as never,
  }),
);
