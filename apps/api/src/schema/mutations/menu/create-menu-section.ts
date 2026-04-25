import { createMenuSectionSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateMenuSectionInput } from './inputs.js';

export interface CreateMenuSectionArgs {
  menuId: string;
  name: string;
}

export async function resolveCreateMenuSection(
  query: object,
  input: CreateMenuSectionArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can create menu sections');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const menu = await ctx.prisma.menu.findFirst({
    where: { id: input.menuId, locationId },
    select: { id: true },
  });
  if (!menu) throw new NotFoundError('Menu not found');
  const last = await ctx.prisma.menuSection.findFirst({
    where: { menuId: input.menuId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = last ? last.sortOrder + 1 : 0;
  const created = (await ctx.prisma.menuSection.create({
    ...query,
    data: { menuId: input.menuId, name: input.name, sortOrder },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'menu.section.created',
    resourceType: 'menu_section',
    resourceId: created.id,
    metadata: { menuId: input.menuId },
  });
  return created;
}

builder.mutationField('createMenuSection', (t) =>
  t.prismaField({
    type: 'MenuSection',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CreateMenuSectionInput, required: true }) },
    validate: { schema: z.object({ input: createMenuSectionSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateMenuSection(query, args.input as CreateMenuSectionArgs, ctx) as never,
  }),
);
