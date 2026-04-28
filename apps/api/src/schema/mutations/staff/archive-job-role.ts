import { archiveJobRoleSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveJobRoleInput } from './inputs.js';

export interface ArchiveJobRoleArgs {
  id: string;
}

const ADMIN_ROLES: readonly string[] = ['OWNER', 'ADMIN'];

export async function resolveArchiveJobRole(
  query: object,
  input: ArchiveJobRoleArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ADMIN_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only admins can archive job roles');
  }
  const tenantId = ctx.auth.tenant.id;
  const existing = await ctx.prisma.jobRole.findFirst({
    where: { id: input.id, tenantId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Job role not found');
  const updated = (await ctx.prisma.jobRole.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'job_role.archived',
    resourceType: 'job_role',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveJobRole', (t) =>
  t.prismaField({
    type: 'JobRole',
    authScopes: { admin: true },
    args: { input: t.arg({ type: ArchiveJobRoleInput, required: true }) },
    validate: { schema: z.object({ input: archiveJobRoleSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveJobRole(query, args.input as ArchiveJobRoleArgs, ctx) as never,
  }),
);
