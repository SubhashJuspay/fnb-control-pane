import { updateMenuSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateMenuInput } from './inputs.js';

export interface UpdateMenuArgs {
  id: string;
  name?: string | null;
  description?: string | null;
  schedule?: unknown;
  isActive?: boolean | null;
}

export async function resolveUpdateMenu(
  query: object,
  input: UpdateMenuArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can update menus');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.menu.findFirst({
    where: { id: input.id, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Menu not found');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.schedule !== undefined) data.schedule = input.schedule as never;
  if (input.isActive !== undefined && input.isActive !== null) data.isActive = input.isActive;
  const updated = (await ctx.prisma.menu.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'menu.updated',
    resourceType: 'menu',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('updateMenu', (t) =>
  t.prismaField({
    type: 'Menu',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateMenuInput, required: true }) },
    validate: { schema: z.object({ input: updateMenuSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateMenu(query, args.input as UpdateMenuArgs, ctx) as never,
  }),
);
