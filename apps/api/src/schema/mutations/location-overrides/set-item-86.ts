import { setItem86Schema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { SetItem86Input } from './inputs.js';

export interface SetItem86Args {
  menuItemId: string;
  available: boolean;
}

/**
 * STAFF-scope mutation. Sets only the `available` flag on a LocationItem row,
 * never touches `hidden` or `priceCents`. Used for the kitchen "86" workflow.
 */
export async function resolveSetItem86(
  query: object,
  input: SetItem86Args,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER', 'STAFF'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can toggle 86 status');
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
  const upserted = (await ctx.prisma.locationItem.upsert({
    ...query,
    where: { locationId_menuItemId: { locationId, menuItemId: input.menuItemId } },
    create: { locationId, menuItemId: input.menuItemId, available: input.available },
    update: { available: input.available },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'location.item.86_toggled',
    resourceType: 'location_item',
    resourceId: upserted.id,
    metadata: { menuItemId: input.menuItemId, available: input.available },
  });
  return upserted;
}

builder.mutationField('setItem86', (t) =>
  t.prismaField({
    type: 'LocationItem',
    authScopes: { staff: true },
    args: { input: t.arg({ type: SetItem86Input, required: true }) },
    validate: { schema: z.object({ input: setItem86Schema }) },
    resolve: (query, _root, args, ctx) =>
      resolveSetItem86(query, args.input as SetItem86Args, ctx) as never,
  }),
);
