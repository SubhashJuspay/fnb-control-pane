import { createModifierGroupSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateModifierGroupInput } from './inputs.js';

export interface CreateModifierGroupArgs {
  name: string;
  minSelections?: number | null;
  maxSelections?: number | null;
}

export async function resolveCreateModifierGroup(
  query: object,
  input: CreateModifierGroupArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can create modifier groups');
  }
  const created = (await ctx.prisma.modifierGroup.create({
    ...query,
    data: {
      tenantId: ctx.auth.tenant.id,
      name: input.name,
      minSelections: input.minSelections ?? 0,
      maxSelections: input.maxSelections ?? 1,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.modifier_group.created',
    resourceType: 'modifier_group',
    resourceId: created.id,
  });
  return created;
}

builder.mutationField('createModifierGroup', (t) =>
  t.prismaField({
    type: 'ModifierGroup',
    authScopes: { admin: true },
    args: { input: t.arg({ type: CreateModifierGroupInput, required: true }) },
    validate: { schema: z.object({ input: createModifierGroupSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateModifierGroup(query, args.input as CreateModifierGroupArgs, ctx) as never,
  }),
);
