import { updateMenuSectionSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateMenuSectionInput } from './inputs.js';

export interface UpdateMenuSectionArgs {
  id: string;
  name?: string | null;
}

export async function resolveUpdateMenuSection(
  query: object,
  input: UpdateMenuSectionArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can update menu sections');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.menuSection.findFirst({
    where: { id: input.id, menu: { locationId } },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Menu section not found');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  const updated = (await ctx.prisma.menuSection.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'menu.section.updated',
    resourceType: 'menu_section',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('updateMenuSection', (t) =>
  t.prismaField({
    type: 'MenuSection',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateMenuSectionInput, required: true }) },
    validate: { schema: z.object({ input: updateMenuSectionSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateMenuSection(query, args.input as UpdateMenuSectionArgs, ctx) as never,
  }),
);
