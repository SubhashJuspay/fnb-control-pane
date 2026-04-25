import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';

/**
 * AuditLog object exposure. The `actor` relation does NOT exist on the model
 * (we keep `actorUserId` as a free-form identifier). To present a friendly
 * actor in the UI we expose `actorUserId` as a string and add a derived
 * `actorEmail` field that loads the email when available.
 */
export const AuditLogRef = builder.prismaObject('AuditLog', {
  fields: (t) => ({
    id: t.exposeID('id'),
    action: t.exposeString('action'),
    resourceType: t.exposeString('resourceType'),
    resourceId: t.exposeString('resourceId', { nullable: true }),
    actorUserId: t.exposeString('actorUserId', { nullable: true }),
    actorEmail: t.field({
      type: 'String',
      nullable: true,
      resolve: async (parent, _args, ctx) => {
        if (!parent.actorUserId) return null;
        const u = await ctx.prisma.user.findUnique({
          where: { id: parent.actorUserId },
          select: { email: true },
        });
        return u?.email ?? null;
      },
    }),
    metadata: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (parent) => parent.metadata as unknown,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

/** Pure resolver for the auditLogs connection — directly testable. */
export async function resolveAuditLogs(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.auditLog.findMany({
    ...query,
    where: { tenantId: ctx.auth.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
}

builder.queryField('auditLogs', (t) =>
  t.prismaConnection({
    type: 'AuditLog',
    cursor: 'id',
    description: 'Audit-log entries within the current tenant. Requires admin role.',
    authScopes: { admin: true },
    resolve: (query, _root, _args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      return ctx.prisma.auditLog.findMany({
        ...query,
        where: { tenantId: ctx.auth.tenant.id },
        orderBy: { createdAt: 'desc' },
      });
    },
    totalCount: (_root, _args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      return ctx.prisma.auditLog.count({
        where: { tenantId: ctx.auth.tenant.id },
      });
    },
  }),
);
