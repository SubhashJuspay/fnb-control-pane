import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { MembershipStatusEnum, RoleEnum } from './enums.js';

export const MembershipRef = builder.prismaObject('Membership', {
  fields: (t) => ({
    id: t.exposeID('id'),
    role: t.field({
      type: RoleEnum,
      authScopes: { authenticated: true },
      resolve: (parent) => parent.role,
    }),
    status: t.field({
      type: MembershipStatusEnum,
      authScopes: { authenticated: true },
      resolve: (parent) => parent.status,
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      authScopes: { authenticated: true },
    }),
    user: t.relation('user', { authScopes: { authenticated: true } }),
    tenant: t.relation('tenant', { authScopes: { authenticated: true } }),
    location: t.relation('location', {
      authScopes: { authenticated: true },
      nullable: true,
    }),
  }),
});

/** Pure resolver for the tenantMembers connection — directly testable. */
export async function resolveTenantMembers(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.membership.findMany({
    ...query,
    where: { tenantId: ctx.auth.tenant.id },
    orderBy: { createdAt: 'asc' },
  });
}

builder.queryField('tenantMembers', (t) =>
  t.prismaConnection({
    type: 'Membership',
    cursor: 'id',
    description: 'Memberships within the current tenant. Requires admin role.',
    authScopes: { admin: true },
    resolve: (query, _root, _args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      return ctx.prisma.membership.findMany({
        ...query,
        where: { tenantId: ctx.auth.tenant.id },
        orderBy: { createdAt: 'asc' },
      });
    },
    totalCount: (_root, _args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      return ctx.prisma.membership.count({
        where: { tenantId: ctx.auth.tenant.id },
      });
    },
  }),
);
