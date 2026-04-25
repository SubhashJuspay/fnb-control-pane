import { updateModifierSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateModifierInput } from './inputs.js';

export interface UpdateModifierArgs {
  id: string;
  name?: string | null;
  priceDeltaCents?: number | null;
  isDefault?: boolean | null;
}

export async function resolveUpdateModifier(
  query: object,
  input: UpdateModifierArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can update modifiers');
  }
  // Verify the modifier belongs to a group in the tenant.
  const existing = await ctx.prisma.modifier.findFirst({
    where: {
      id: input.id,
      modifierGroup: { tenantId: ctx.auth.tenant.id },
    },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Modifier not found');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.priceDeltaCents !== undefined && input.priceDeltaCents !== null)
    data.priceDeltaCents = input.priceDeltaCents;
  if (input.isDefault !== undefined && input.isDefault !== null)
    data.isDefault = input.isDefault;
  const updated = (await ctx.prisma.modifier.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.modifier.updated',
    resourceType: 'modifier',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('updateModifier', (t) =>
  t.prismaField({
    type: 'Modifier',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UpdateModifierInput, required: true }) },
    validate: { schema: z.object({ input: updateModifierSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateModifier(query, args.input as UpdateModifierArgs, ctx) as never,
  }),
);
