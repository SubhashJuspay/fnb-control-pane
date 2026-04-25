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
    status: t.field({
      type: LocationStatusEnum,
      resolve: (parent) => parent.status,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    tenant: t.relation('tenant', { authScopes: { authenticated: true } }),
  }),
});

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
