import type { RequestContext } from '../context.js';
import { builder } from './builder.js';
import { LocationStatusEnum as _LocationStatusEnum, TenantStatusEnum } from './enums.js';

// Reference to ensure enum is registered for Location.status reads.
void _LocationStatusEnum;

/**
 * Returns the userId associated with this request. For authenticated contexts
 * with a tenant resolved this is `ctx.auth.user.id`. For tenantless callers
 * (the location-switcher / viewer page) the upstream context attaches a
 * `__userId` side-channel, which we read here.
 */
export function userIdFor(ctx: RequestContext): string | null {
  if (ctx.auth.kind === 'authenticated') return ctx.auth.user.id;
  const sideChannel = (ctx as unknown as { __userId?: string }).__userId;
  return sideChannel ?? null;
}

/** Pure resolver for Query.myTenants — extracted so it can be unit-tested. */
export async function resolveMyTenants(query: object, ctx: RequestContext): Promise<unknown[]> {
  const userId = userIdFor(ctx);
  if (!userId) return [];
  return ctx.prisma.tenant.findMany({
    ...query,
    where: {
      status: 'ACTIVE',
      memberships: { some: { userId, status: 'ACTIVE' } },
    },
    orderBy: { name: 'asc' },
  });
}

/** Pure resolver for Tenant.locations — extracted so it can be unit-tested. */
export async function resolveTenantLocations(
  query: object,
  parent: { id: string },
  ctx: RequestContext,
): Promise<unknown[]> {
  const userId = userIdFor(ctx);
  if (!userId) return [];
  const memberships = await ctx.prisma.membership.findMany({
    where: { userId, tenantId: parent.id, status: 'ACTIVE' },
    select: { locationId: true },
  });
  if (memberships.length === 0) return [];
  const tenantWide = memberships.some((m) => m.locationId === null);
  if (tenantWide) {
    return ctx.prisma.location.findMany({
      ...query,
      where: { tenantId: parent.id, status: { not: 'ARCHIVED' } },
      orderBy: { name: 'asc' },
    });
  }
  const ids = memberships.map((m) => m.locationId).filter((x): x is string => !!x);
  return ctx.prisma.location.findMany({
    ...query,
    where: { id: { in: ids }, status: { not: 'ARCHIVED' } },
    orderBy: { name: 'asc' },
  });
}

export const TenantRef = builder.prismaObject('Tenant', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    status: t.field({
      type: TenantStatusEnum,
      resolve: (parent) => parent.status,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    locations: t.prismaField({
      type: ['Location'],
      authScopes: { authenticated: true },
      resolve: (query, parent, _args, ctx) => resolveTenantLocations(query, parent, ctx) as never,
    }),
  }),
});

builder.queryField('myTenants', (t) =>
  t.prismaField({
    type: ['Tenant'],
    description: 'Tenants the current viewer has at least one ACTIVE membership in.',
    resolve: (query, _root, _args, ctx) => resolveMyTenants(query, ctx) as never,
  }),
);
