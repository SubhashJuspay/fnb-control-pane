import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { TaxCategoryKindEnum } from './enums.js';

export const TaxRateRef = builder.prismaObject('TaxRate', {
  fields: (t) => ({
    id: t.exposeID('id'),
    ratePermille: t.exposeInt('ratePermille'),
    effectiveFrom: t.expose('effectiveFrom', { type: 'DateTime' }),
    effectiveUntil: t.expose('effectiveUntil', { type: 'DateTime', nullable: true }),
    locationId: t.exposeID('locationId'),
    taxCategoryId: t.exposeID('taxCategoryId'),
  }),
});

/** Pure resolver for TaxCategory.ratesAtLocation — directly testable. */
export async function resolveRatesAtLocation(
  query: object,
  parent: { id: string; tenantId: string },
  args: { locationId: string },
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  // Validate location belongs to the tenant.
  const loc = await ctx.prisma.location.findFirst({
    where: { id: args.locationId, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!loc) return [];
  return ctx.prisma.taxRate.findMany({
    ...query,
    where: { taxCategoryId: parent.id, locationId: args.locationId },
    orderBy: { effectiveFrom: 'desc' },
  });
}

export const TaxCategoryRef = builder.prismaObject('TaxCategory', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    kind: t.field({
      type: TaxCategoryKindEnum,
      resolve: (parent) => parent.kind,
    }),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    ratesAtLocation: t.prismaField({
      type: ['TaxRate'],
      args: { locationId: t.arg({ type: 'UUID', required: true }) },
      authScopes: { manager: true },
      resolve: (query, parent, args, ctx) =>
        resolveRatesAtLocation(
          query,
          parent as { id: string; tenantId: string },
          { locationId: args.locationId as string },
          ctx,
        ) as never,
    }),
  }),
});

/** Pure resolver for catalogTaxCategories — directly testable. */
export async function resolveCatalogTaxCategories(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.taxCategory.findMany({
    ...query,
    where: { tenantId: ctx.auth.tenant.id, archivedAt: null },
    orderBy: { name: 'asc' },
  });
}

builder.queryField('catalogTaxCategories', (t) =>
  t.prismaField({
    type: ['TaxCategory'],
    description: 'All non-archived tax categories for the current tenant. Requires manager role.',
    authScopes: { manager: true },
    resolve: (query, _root, _args, ctx) => resolveCatalogTaxCategories(query, ctx) as never,
  }),
);
