import { createLocationSchema } from '@repo/validation/location';
import { z } from 'zod';
import type { RequestContext } from '../../context.js';
import { writeAudit } from '../../audit.js';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { builder } from '../builder.js';

export const CreateLocationInput = builder.inputType('CreateLocationInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    slug: t.string({ required: true }),
    timezone: t.string({ required: true }),
    currency: t.string({ required: true }),
    locale: t.string({ required: false }),
    businessDayCutoff: t.string({ required: false }),
  }),
});

export interface CreateLocationArgs {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  locale?: string | null;
  businessDayCutoff?: string | null;
}

/** Pure resolver for createLocation — extracted for direct unit testing. */
export async function resolveCreateLocation(
  query: object,
  input: CreateLocationArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can create locations');
  }
  const existing = await ctx.prisma.location.findFirst({
    where: { tenantId: ctx.auth.tenant.id, slug: input.slug },
  });
  if (existing) throw new ConflictError('A location with that slug already exists');
  const created = await ctx.prisma.location.create({
    ...query,
    data: {
      tenantId: ctx.auth.tenant.id,
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
      currency: input.currency,
      locale: input.locale ?? 'en-US',
      businessDayCutoff: input.businessDayCutoff ?? '04:00',
    },
  });
  await writeAudit(ctx, {
    action: 'location.created',
    resourceType: 'location',
    resourceId: (created as { id: string }).id,
  });
  return created;
}

builder.mutationField('createLocation', (t) =>
  t.prismaField({
    type: 'Location',
    authScopes: { admin: true },
    args: { input: t.arg({ type: CreateLocationInput, required: true }) },
    validate: { schema: z.object({ input: createLocationSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateLocation(query, args.input as CreateLocationArgs, ctx) as never,
  }),
);
