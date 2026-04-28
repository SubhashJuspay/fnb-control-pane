import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';

export type SectionRow = {
  id: string;
  locationId: string;
  name: string;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Pure resolver for `Query.floorSections`. */
export async function resolveFloorSections(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.section.findMany({
    ...query,
    where: { locationId: ctx.auth.location.id, archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export const SectionRef = builder.prismaObject('Section', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    sortOrder: t.exposeInt('sortOrder'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    tables: t.relation('tables', {
      authScopes: { staff: true },
      query: { where: { archivedAt: null }, orderBy: { label: 'asc' } },
    }),
  }),
});

builder.queryField('floorSections', (t) =>
  t.prismaField({
    type: ['Section'],
    description: "Non-archived sections at the viewer's location, ordered by sortOrder asc.",
    authScopes: { staff: true },
    resolve: (query, _root, _args, ctx) => resolveFloorSections(query, ctx) as never,
  }),
);
