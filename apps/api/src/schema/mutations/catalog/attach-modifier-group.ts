import { attachModifierGroupSchema, detachModifierGroupSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { AttachModifierGroupInput, DetachModifierGroupInput } from './inputs.js';

export interface AttachModifierGroupArgs {
  menuItemId: string;
  modifierGroupId: string;
  sortOrder?: number | null;
}

export async function resolveAttachModifierGroup(
  input: AttachModifierGroupArgs,
  ctx: RequestContext,
): Promise<{ menuItemId: string; modifierGroupId: string; sortOrder: number }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can attach modifier groups');
  }
  const tenantId = ctx.auth.tenant.id;
  const item = await ctx.prisma.menuItem.findFirst({
    where: { id: input.menuItemId, tenantId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError('Menu item not found');
  const group = await ctx.prisma.modifierGroup.findFirst({
    where: { id: input.modifierGroupId, tenantId },
    select: { id: true },
  });
  if (!group) throw new NotFoundError('Modifier group not found');
  const exists = await ctx.prisma.menuItemModifierGroup.findUnique({
    where: {
      menuItemId_modifierGroupId: {
        menuItemId: input.menuItemId,
        modifierGroupId: input.modifierGroupId,
      },
    },
  });
  if (exists) {
    throw new ConflictError('Modifier group is already attached to this item');
  }
  let sortOrder = input.sortOrder ?? null;
  if (sortOrder === null || sortOrder === undefined) {
    const last = await ctx.prisma.menuItemModifierGroup.findFirst({
      where: { menuItemId: input.menuItemId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = last ? last.sortOrder + 1 : 0;
  }
  await ctx.prisma.menuItemModifierGroup.create({
    data: {
      menuItemId: input.menuItemId,
      modifierGroupId: input.modifierGroupId,
      sortOrder,
    },
  });
  await writeAudit(ctx, {
    action: 'catalog.item.modifier_group.attached',
    resourceType: 'menu_item',
    resourceId: input.menuItemId,
    metadata: { modifierGroupId: input.modifierGroupId, sortOrder },
  });
  return {
    menuItemId: input.menuItemId,
    modifierGroupId: input.modifierGroupId,
    sortOrder,
  };
}

export async function resolveDetachModifierGroup(
  input: { menuItemId: string; modifierGroupId: string },
  ctx: RequestContext,
): Promise<{ menuItemId: string; modifierGroupId: string }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can detach modifier groups');
  }
  const tenantId = ctx.auth.tenant.id;
  // Verify the item belongs to the tenant (and indirectly that the attachment is in our tenant scope).
  const item = await ctx.prisma.menuItem.findFirst({
    where: { id: input.menuItemId, tenantId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError('Menu item not found');
  const attachment = await ctx.prisma.menuItemModifierGroup.findUnique({
    where: {
      menuItemId_modifierGroupId: {
        menuItemId: input.menuItemId,
        modifierGroupId: input.modifierGroupId,
      },
    },
  });
  if (!attachment) throw new NotFoundError('Attachment not found');
  await ctx.prisma.menuItemModifierGroup.delete({
    where: {
      menuItemId_modifierGroupId: {
        menuItemId: input.menuItemId,
        modifierGroupId: input.modifierGroupId,
      },
    },
  });
  await writeAudit(ctx, {
    action: 'catalog.item.modifier_group.detached',
    resourceType: 'menu_item',
    resourceId: input.menuItemId,
    metadata: { modifierGroupId: input.modifierGroupId },
  });
  return {
    menuItemId: input.menuItemId,
    modifierGroupId: input.modifierGroupId,
  };
}

const AttachModifierGroupResult = builder.objectRef<{
  menuItemId: string;
  modifierGroupId: string;
  sortOrder: number;
}>('AttachModifierGroupResult');
AttachModifierGroupResult.implement({
  description: 'Result of attaching a modifier group to a menu item.',
  fields: (t) => ({
    menuItemId: t.exposeID('menuItemId'),
    modifierGroupId: t.exposeID('modifierGroupId'),
    sortOrder: t.exposeInt('sortOrder'),
  }),
});

const DetachModifierGroupResult = builder.objectRef<{
  menuItemId: string;
  modifierGroupId: string;
}>('DetachModifierGroupResult');
DetachModifierGroupResult.implement({
  description: 'Result of detaching a modifier group from a menu item.',
  fields: (t) => ({
    menuItemId: t.exposeID('menuItemId'),
    modifierGroupId: t.exposeID('modifierGroupId'),
  }),
});

builder.mutationField('attachModifierGroupToItem', (t) =>
  t.field({
    type: AttachModifierGroupResult,
    authScopes: { admin: true },
    args: { input: t.arg({ type: AttachModifierGroupInput, required: true }) },
    validate: { schema: z.object({ input: attachModifierGroupSchema }) },
    resolve: (_root, args, ctx) =>
      resolveAttachModifierGroup(args.input as AttachModifierGroupArgs, ctx),
  }),
);

builder.mutationField('detachModifierGroupFromItem', (t) =>
  t.field({
    type: DetachModifierGroupResult,
    authScopes: { admin: true },
    args: { input: t.arg({ type: DetachModifierGroupInput, required: true }) },
    validate: { schema: z.object({ input: detachModifierGroupSchema }) },
    resolve: (_root, args, ctx) =>
      resolveDetachModifierGroup(
        args.input as { menuItemId: string; modifierGroupId: string },
        ctx,
      ),
  }),
);
