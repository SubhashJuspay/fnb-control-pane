import type { Prisma } from '@repo/db';
import type { RequestContext } from './context.js';

export interface WriteAuditArgs {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: unknown;
}

/**
 * Write an audit log entry attributed to the authenticated actor in `ctx`.
 * Silently no-ops for anonymous contexts (anonymous mutations write their own
 * audit entries via the alternate `writeAnonymousAudit` helper).
 */
export async function writeAudit(ctx: RequestContext, args: WriteAuditArgs): Promise<void> {
  if (ctx.auth.kind !== 'authenticated') return;
  await ctx.prisma.auditLog.create({
    data: {
      tenantId: ctx.auth.tenant.id,
      locationId: ctx.auth.location?.id ?? null,
      actorUserId: ctx.auth.user.id,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId ?? null,
      metadata: (args.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Write an audit log entry from an anonymous context (e.g. acceptInvitation).
 * Caller must supply tenantId explicitly because anonymous ctx has no tenant.
 */
export async function writeAnonymousAudit(
  ctx: RequestContext,
  args: WriteAuditArgs & {
    tenantId: string;
    locationId?: string | null;
    actorUserId?: string | null;
  },
): Promise<void> {
  await ctx.prisma.auditLog.create({
    data: {
      tenantId: args.tenantId,
      locationId: args.locationId ?? null,
      actorUserId: args.actorUserId ?? null,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId ?? null,
      metadata: (args.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
