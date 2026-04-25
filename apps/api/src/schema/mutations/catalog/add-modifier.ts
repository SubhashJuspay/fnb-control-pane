import { addModifierSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { AddModifierInput } from './inputs.js';

export interface AddModifierArgs {
  modifierGroupId: string;
  name: string;
  priceDeltaCents?: number | null;
  isDefault?: boolean | null;
}

export async function resolveAddModifier(
  query: object,
  input: AddModifierArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can add modifiers');
  }
  const group = await ctx.prisma.modifierGroup.findFirst({
    where: { id: input.modifierGroupId, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!group) throw new NotFoundError('Modifier group not found');
  // Pick next sortOrder.
  const last = await ctx.prisma.modifier.findFirst({
    where: { modifierGroupId: input.modifierGroupId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const created = (await ctx.prisma.modifier.create({
    ...query,
    data: {
      modifierGroupId: input.modifierGroupId,
      name: input.name,
      priceDeltaCents: input.priceDeltaCents ?? 0,
      isDefault: input.isDefault ?? false,
      sortOrder: last ? last.sortOrder + 1 : 0,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.modifier.added',
    resourceType: 'modifier',
    resourceId: created.id,
  });
  return created;
}

builder.mutationField('addModifier', (t) =>
  t.prismaField({
    type: 'Modifier',
    authScopes: { admin: true },
    args: { input: t.arg({ type: AddModifierInput, required: true }) },
    validate: { schema: z.object({ input: addModifierSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveAddModifier(query, args.input as AddModifierArgs, ctx) as never,
  }),
);
