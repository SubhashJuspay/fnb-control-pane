import { Prisma } from '@repo/db';
import { updateLocationSettingsSchema } from '@repo/validation/location';
import { z } from 'zod';
import { writeAudit } from '../../audit.js';
import type { RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import { builder } from '../builder.js';

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

interface OpeningInterval {
  open: string;
  close: string;
}

export interface UpdateLocationSettingsArgs {
  phone?: string | null;
  address?: Record<string, string | null | undefined> | null;
  openingHours?: Record<string, OpeningInterval[]> | null;
}

const OpeningIntervalInput = builder.inputType('OpeningIntervalInput', {
  fields: (t) => ({
    open: t.string({ required: true }),
    close: t.string({ required: true }),
  }),
});

const OpeningHoursInput = builder.inputType('OpeningHoursInput', {
  fields: (t) => ({
    sun: t.field({ type: [OpeningIntervalInput], required: false }),
    mon: t.field({ type: [OpeningIntervalInput], required: false }),
    tue: t.field({ type: [OpeningIntervalInput], required: false }),
    wed: t.field({ type: [OpeningIntervalInput], required: false }),
    thu: t.field({ type: [OpeningIntervalInput], required: false }),
    fri: t.field({ type: [OpeningIntervalInput], required: false }),
    sat: t.field({ type: [OpeningIntervalInput], required: false }),
  }),
});

const AddressInput = builder.inputType('AddressInput', {
  fields: (t) => ({
    line1: t.string({ required: false }),
    line2: t.string({ required: false }),
    city: t.string({ required: false }),
    region: t.string({ required: false }),
    postalCode: t.string({ required: false }),
    country: t.string({ required: false }),
  }),
});

const UpdateLocationSettingsInput = builder.inputType(
  'UpdateLocationSettingsInput',
  {
    fields: (t) => ({
      phone: t.string({ required: false }),
      address: t.field({ type: AddressInput, required: false }),
      openingHours: t.field({ type: OpeningHoursInput, required: false }),
    }),
  },
);

/**
 * Pure resolver. Manager-scope, scoped to the request's location.
 * Only updates fields explicitly present in the input — undefined fields
 * leave the existing value alone, while explicit `null` clears it (DbNull
 * for the JSON columns, NULL for `phone`).
 */
export async function resolveUpdateLocationSettings(
  query: object,
  input: UpdateLocationSettingsArgs,
  ctx: RequestContext,
  rawKeys?: Set<string>,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can edit location settings');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const has = (k: string): boolean =>
    rawKeys
      ? rawKeys.has(k)
      : (input as Record<string, unknown>)[k] !== undefined;

  const data: Record<string, unknown> = {};
  if (has('phone')) {
    data.phone = input.phone ?? null;
  }
  if (has('address')) {
    data.address =
      input.address == null ? Prisma.DbNull : (input.address as object);
  }
  if (has('openingHours')) {
    data.openingHours =
      input.openingHours == null ? Prisma.DbNull : (input.openingHours as object);
  }

  const updated = (await ctx.prisma.location.update({
    ...query,
    where: { id: locationId },
    data,
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'location.settings_updated',
    resourceType: 'location',
    resourceId: updated.id,
    metadata: {
      phoneSet: has('phone'),
      addressSet: has('address'),
      openingHoursSet: has('openingHours'),
    },
  });

  return updated;
}

builder.mutationField('updateLocationSettings', (t) =>
  t.prismaField({
    type: 'Location',
    authScopes: { manager: true },
    description:
      'Update the active location\'s phone / address / opening hours. Manager-scope; only the location in the request scope is touched.',
    args: { input: t.arg({ type: UpdateLocationSettingsInput, required: true }) },
    validate: { schema: z.object({ input: updateLocationSettingsSchema }) },
    resolve: (query, _root, args, ctx) => {
      const raw = args.input as UpdateLocationSettingsArgs;
      return resolveUpdateLocationSettings(
        query,
        raw,
        ctx,
        new Set(Object.keys(raw)),
      ) as never;
    },
  }),
);
