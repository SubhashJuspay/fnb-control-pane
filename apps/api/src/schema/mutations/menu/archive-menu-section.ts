import { archiveMenuSectionSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveMenuSectionInput } from './inputs.js';

export interface ArchiveMenuSectionArgs {
  id: string;
}

export async function resolveArchiveMenuSection(
  query: object,
  input: ArchiveMenuSectionArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can archive menu sections');
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
  const updated = (await ctx.prisma.menuSection.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'menu.section.archived',
    resourceType: 'menu_section',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveMenuSection', (t) =>
  t.prismaField({
    type: 'MenuSection',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ArchiveMenuSectionInput, required: true }) },
    validate: { schema: z.object({ input: archiveMenuSectionSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveMenuSection(query, args.input as ArchiveMenuSectionArgs, ctx) as never,
  }),
);
