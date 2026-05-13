import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { LocationStatusEnum } from './enums.js';

export const LocationRef = builder.prismaObject('Location', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    timezone: t.exposeString('timezone'),
    currency: t.exposeString('currency'),
    locale: t.exposeString('locale'),
    businessDayCutoff: t.exposeString('businessDayCutoff'),
    phone: t.exposeString('phone', { nullable: true }),
    address: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (p) => (p as { address: unknown }).address ?? null,
    }),
    openingHours: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (p) => (p as { openingHours: unknown }).openingHours ?? null,
    }),
    status: t.field({
      type: LocationStatusEnum,
      resolve: (parent) => parent.status,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    tenant: t.relation('tenant', { authScopes: { authenticated: true } }),
  }),
});

/**
 * Returns the location currently in the request scope (`x-location-id` header).
 * Authenticated; no role gating — anyone with a session that's been routed to
 * a location can read its public-ish settings.
 */
builder.queryField('currentLocation', (t) =>
  t.prismaField({
    type: 'Location',
    nullable: true,
    description: "The location bound to the current request scope. Null if the request isn't location-scoped.",
    resolve: async (query, _root, _args, ctx) => {
      if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return null;
      return (await ctx.prisma.location.findUnique({
        ...query,
        where: { id: ctx.auth.location.id },
      })) as never;
    },
  }),
);

/** Pure resolver for tenantLocations — extracted for direct unit testing. */
export async function resolveTenantLocationsAdmin(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.location.findMany({
    ...query,
    where: { tenantId: ctx.auth.tenant.id, status: { not: 'ARCHIVED' } },
    orderBy: { name: 'asc' },
  });
}

builder.queryField('tenantLocations', (t) =>
  t.prismaField({
    type: ['Location'],
    description: 'All non-archived locations within the current tenant. Requires admin role.',
    authScopes: { admin: true },
    resolve: (query, _root, _args, ctx) => resolveTenantLocationsAdmin(query, ctx) as never,
  }),
);
