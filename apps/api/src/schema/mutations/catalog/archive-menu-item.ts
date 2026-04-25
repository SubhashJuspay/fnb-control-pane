import { archiveMenuItemSchema, unarchiveMenuItemSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveMenuItemInput, UnarchiveMenuItemInput } from './inputs.js';

export interface ArchiveMenuItemArgs {
  id: string;
}

export async function resolveArchiveMenuItem(
  query: object,
  input: ArchiveMenuItemArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can archive menu items');
  }
  const existing = await ctx.prisma.menuItem.findFirst({
    where: { id: input.id, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Menu item not found');
  const updated = (await ctx.prisma.menuItem.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.item.archived',
    resourceType: 'menu_item',
    resourceId: updated.id,
  });
  return updated;
}

export async function resolveUnarchiveMenuItem(
  query: object,
  input: ArchiveMenuItemArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can unarchive menu items');
  }
  const existing = await ctx.prisma.menuItem.findFirst({
    where: { id: input.id, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Menu item not found');
  const updated = (await ctx.prisma.menuItem.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: null },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'catalog.item.unarchived',
    resourceType: 'menu_item',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveMenuItem', (t) =>
  t.prismaField({
    type: 'MenuItem',
    authScopes: { admin: true },
    args: { input: t.arg({ type: ArchiveMenuItemInput, required: true }) },
    validate: { schema: z.object({ input: archiveMenuItemSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveMenuItem(query, args.input as ArchiveMenuItemArgs, ctx) as never,
  }),
);

builder.mutationField('unarchiveMenuItem', (t) =>
  t.prismaField({
    type: 'MenuItem',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UnarchiveMenuItemInput, required: true }) },
    validate: { schema: z.object({ input: unarchiveMenuItemSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUnarchiveMenuItem(query, args.input as ArchiveMenuItemArgs, ctx) as never,
  }),
);
