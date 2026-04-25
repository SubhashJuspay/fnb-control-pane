import { createMenuSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateMenuInput } from './inputs.js';

export interface CreateMenuArgs {
  name: string;
  description?: string | null;
  schedule?: unknown;
  isActive?: boolean | null;
}

export async function resolveCreateMenu(
  query: object,
  input: CreateMenuArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can create menus');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const last = await ctx.prisma.menu.findFirst({
    where: { locationId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = last ? last.sortOrder + 1 : 0;
  const created = (await ctx.prisma.menu.create({
    ...query,
    data: {
      locationId,
      name: input.name,
      description: input.description ?? null,
      schedule: (input.schedule ?? { kind: 'always' }) as never,
      isActive: input.isActive ?? true,
      sortOrder,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'menu.created',
    resourceType: 'menu',
    resourceId: created.id,
  });
  return created;
}

builder.mutationField('createMenu', (t) =>
  t.prismaField({
    type: 'Menu',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CreateMenuInput, required: true }) },
    validate: { schema: z.object({ input: createMenuSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateMenu(query, args.input as CreateMenuArgs, ctx) as never,
  }),
);
