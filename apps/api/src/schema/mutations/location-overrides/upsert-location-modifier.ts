import { upsertLocationModifierSchema } from '@repo/validation/menu';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpsertLocationModifierInput } from './inputs.js';

export interface UpsertLocationModifierArgs {
  modifierId: string;
  hidden?: boolean | null;
  available?: boolean | null;
  priceDeltaOverrideCents?: number | null;
}

export async function resolveUpsertLocationModifier(
  query: object,
  input: UpsertLocationModifierArgs,
  ctx: RequestContext,
  rawInputKeys?: Set<string>,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can set modifier overrides');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const tenantId = ctx.auth.tenant.id;
  const locationId = ctx.auth.location.id;
  // Verify the modifier belongs to a group inside this tenant.
  const modifier = await ctx.prisma.modifier.findFirst({
    where: { id: input.modifierId, modifierGroup: { tenantId } },
    select: { id: true },
  });
  if (!modifier) throw new NotFoundError('Modifier not found');
  const has = (k: string): boolean =>
    rawInputKeys
      ? rawInputKeys.has(k)
      : (input as unknown as Record<string, unknown>)[k] !== undefined;
  const createData: Record<string, unknown> = { locationId, modifierId: input.modifierId };
  const updateData: Record<string, unknown> = {};
  if (has('hidden') && input.hidden !== undefined && input.hidden !== null) {
    createData.hidden = input.hidden;
    updateData.hidden = input.hidden;
  }
  if (has('available') && input.available !== undefined && input.available !== null) {
    createData.available = input.available;
    updateData.available = input.available;
  }
  if (has('priceDeltaOverrideCents')) {
    createData.priceDeltaOverrideCents = input.priceDeltaOverrideCents ?? null;
    updateData.priceDeltaOverrideCents = input.priceDeltaOverrideCents ?? null;
  }
  const upserted = (await ctx.prisma.locationModifier.upsert({
    ...query,
    where: { locationId_modifierId: { locationId, modifierId: input.modifierId } },
    create: createData as never,
    update: updateData as never,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'location.modifier.override_set',
    resourceType: 'location_modifier',
    resourceId: upserted.id,
    metadata: {
      modifierId: input.modifierId,
      hidden: input.hidden ?? null,
      available: input.available ?? null,
      priceDeltaOverrideCents: input.priceDeltaOverrideCents ?? null,
    },
  });
  return upserted;
}

// Register a minimal LocationModifier prisma object so this mutation has a return type.
export const LocationModifierRef = builder.prismaObject('LocationModifier', {
  fields: (t) => ({
    id: t.exposeID('id'),
    locationId: t.exposeID('locationId'),
    modifierId: t.exposeID('modifierId'),
    hidden: t.exposeBoolean('hidden'),
    available: t.exposeBoolean('available'),
    priceDeltaOverrideCents: t.exposeInt('priceDeltaOverrideCents', { nullable: true }),
  }),
});

builder.mutationField('upsertLocationModifier', (t) =>
  t.prismaField({
    type: 'LocationModifier',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpsertLocationModifierInput, required: true }) },
    validate: { schema: z.object({ input: upsertLocationModifierSchema }) },
    resolve: (query, _root, args, ctx) => {
      const raw = args.input as UpsertLocationModifierArgs;
      return resolveUpsertLocationModifier(
        query,
        raw,
        ctx,
        new Set(Object.keys(raw)),
      ) as never;
    },
  }),
);
