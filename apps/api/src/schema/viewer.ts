import type { RequestContext } from '../context.js';
import { builder } from './builder.js';
import { userIdFor } from './tenant.js';

export interface ViewerShape {
  id: string;
  email: string;
  name: string | null;
}

const ViewerType = builder.objectRef<ViewerShape>('Viewer');

ViewerType.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    tenants: t.prismaField({
      type: ['Tenant'],
      description: 'Tenants this viewer has at least one ACTIVE membership in.',
      resolve: (query, parent, _args, ctx) =>
        ctx.prisma.tenant.findMany({
          ...query,
          where: {
            status: 'ACTIVE',
            memberships: { some: { userId: parent.id, status: 'ACTIVE' } },
          },
          orderBy: { name: 'asc' },
        }),
    }),
    memberships: t.prismaField({
      type: ['Membership'],
      description: 'Active memberships for this viewer across all tenants.',
      resolve: (query, parent, _args, ctx) =>
        ctx.prisma.membership.findMany({
          ...query,
          where: { userId: parent.id, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        }),
    }),
  }),
});

/** Pure resolver for Query.viewer — extracted so it can be unit-tested. */
export async function resolveViewer(
  ctx: RequestContext,
): Promise<ViewerShape | null> {
  const userId = userIdFor(ctx);
  if (!userId) return null;
  const u = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  return u;
}

/**
 * The location switcher in the web app needs to render the list of tenants /
 * locations available to the viewer BEFORE a tenant has been selected. This
 * is the ONE Query field that is allowed without a tenant header — it does
 * not require an `authenticated` scope.
 */
builder.queryField('viewer', (t) =>
  t.field({
    type: ViewerType,
    nullable: true,
    description: 'The currently signed-in user, regardless of tenant context.',
    resolve: (_root, _args, ctx) => resolveViewer(ctx),
  }),
);

export { ViewerType };
