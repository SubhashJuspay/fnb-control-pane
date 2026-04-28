import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';

export type JobRoleRow = {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

/** Pure resolver for `Query.jobRoles`. Tenant-wide; manager scope. */
export async function resolveJobRoles(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can list job roles');
  }
  return ctx.prisma.jobRole.findMany({
    ...query,
    where: { tenantId: ctx.auth.tenant.id },
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
  });
}

export const JobRoleRef = builder.prismaObject('JobRole', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    color: t.exposeString('color'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

builder.queryField('jobRoles', (t) =>
  t.prismaField({
    type: ['JobRole'],
    description:
      "Job roles defined for the viewer's tenant. Manager scope. Includes archived; ordered by archivedAt asc, name asc.",
    authScopes: { manager: true },
    resolve: (query, _root, _args, ctx) => resolveJobRoles(query, ctx) as never,
  }),
);
