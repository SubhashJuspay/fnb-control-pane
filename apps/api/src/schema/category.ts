import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';

export const CategoryRef = builder.prismaObject('Category', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    sortOrder: t.exposeInt('sortOrder'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

/** Pure resolver for catalogCategories — directly testable. */
export async function resolveCatalogCategories(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.category.findMany({
    ...query,
    where: { tenantId: ctx.auth.tenant.id, archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

builder.queryField('catalogCategories', (t) =>
  t.prismaField({
    type: ['Category'],
    description: 'All non-archived categories within the current tenant. Requires manager role.',
    authScopes: { manager: true },
    resolve: (query, _root, _args, ctx) => resolveCatalogCategories(query, ctx) as never,
  }),
);
