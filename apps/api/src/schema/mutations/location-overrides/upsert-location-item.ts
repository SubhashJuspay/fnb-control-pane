import { upsertLocationItemSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpsertLocationItemInput } from './inputs.js';

export interface UpsertLocationItemArgs {
  menuItemId: string;
  hidden?: boolean | null;
  available?: boolean | null;
  priceCents?: number | null;
  stockOnHand?: number | null;
  lowStockThreshold?: number | null;
}

export async function resolveUpsertLocationItem(
  query: object,
  input: UpsertLocationItemArgs,
  ctx: RequestContext,
  rawInputKeys?: Set<string>,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can set location overrides');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const tenantId = ctx.auth.tenant.id;
  const locationId = ctx.auth.location.id;
  const item = await ctx.prisma.menuItem.findFirst({
    where: { id: input.menuItemId, tenantId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError('Menu item not found');
  // Only persist fields actually present in input — preserve existing values otherwise.
  const has = (k: string): boolean =>
    rawInputKeys
      ? rawInputKeys.has(k)
      : (input as unknown as Record<string, unknown>)[k] !== undefined;
  const createData: Record<string, unknown> = { locationId, menuItemId: input.menuItemId };
  const updateData: Record<string, unknown> = {};
  if (has('hidden') && input.hidden !== undefined && input.hidden !== null) {
    createData.hidden = input.hidden;
    updateData.hidden = input.hidden;
  }
  if (has('available') && input.available !== undefined && input.available !== null) {
    createData.available = input.available;
    updateData.available = input.available;
  }
  if (has('priceCents')) {
    createData.priceCents = input.priceCents ?? null;
    updateData.priceCents = input.priceCents ?? null;
  }
  if (has('stockOnHand')) {
    createData.stockOnHand = input.stockOnHand ?? null;
    updateData.stockOnHand = input.stockOnHand ?? null;
  }
  if (has('lowStockThreshold')) {
    createData.lowStockThreshold = input.lowStockThreshold ?? null;
    updateData.lowStockThreshold = input.lowStockThreshold ?? null;
  }
  const upserted = (await ctx.prisma.locationItem.upsert({
    ...query,
    where: { locationId_menuItemId: { locationId, menuItemId: input.menuItemId } },
    create: createData as never,
    update: updateData as never,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'location.item.override_set',
    resourceType: 'location_item',
    resourceId: upserted.id,
    metadata: {
      menuItemId: input.menuItemId,
      hidden: input.hidden ?? null,
      available: input.available ?? null,
      priceCents: input.priceCents ?? null,
      stockOnHand: input.stockOnHand ?? null,
      lowStockThreshold: input.lowStockThreshold ?? null,
    },
  });
  return upserted;
}

builder.mutationField('upsertLocationItem', (t) =>
  t.prismaField({
    type: 'LocationItem',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpsertLocationItemInput, required: true }) },
    validate: { schema: z.object({ input: upsertLocationItemSchema }) },
    resolve: (query, _root, args, ctx) => {
      const raw = args.input as UpsertLocationItemArgs;
      return resolveUpsertLocationItem(
        query,
        raw,
        ctx,
        new Set(Object.keys(raw)),
      ) as never;
    },
  }),
);
