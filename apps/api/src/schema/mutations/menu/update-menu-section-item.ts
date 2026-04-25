import { updateMenuSectionItemSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateMenuSectionItemInput } from './inputs.js';

export interface UpdateMenuSectionItemArgs {
  id: string;
  priceOverrideCents?: number | null;
}

export async function resolveUpdateMenuSectionItem(
  query: object,
  input: UpdateMenuSectionItemArgs,
  ctx: RequestContext,
  // We accept the explicit-undefined sentinel via property presence: if the
  // caller did not pass `priceOverrideCents` at all, leave the row alone; if
  // they passed `null`, clear the override.
  rawInputKeys?: Set<string>,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can update menu section items');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.menuSectionItem.findFirst({
    where: { id: input.id, menuSection: { menu: { locationId } } },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Menu section item not found');
  const data: Record<string, unknown> = {};
  const includePrice = rawInputKeys
    ? rawInputKeys.has('priceOverrideCents')
    : input.priceOverrideCents !== undefined;
  if (includePrice) data.priceOverrideCents = input.priceOverrideCents ?? null;
  const updated = (await ctx.prisma.menuSectionItem.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'menu.section.item_updated',
    resourceType: 'menu_section_item',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('updateMenuSectionItem', (t) =>
  t.prismaField({
    type: 'MenuSectionItem',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateMenuSectionItemInput, required: true }) },
    validate: { schema: z.object({ input: updateMenuSectionItemSchema }) },
    resolve: (query, _root, args, ctx) => {
      const raw = args.input as UpdateMenuSectionItemArgs;
      const keys = new Set(Object.keys(raw));
      return resolveUpdateMenuSectionItem(query, raw, ctx, keys) as never;
    },
  }),
);
