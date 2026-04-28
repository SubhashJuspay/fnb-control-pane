import { updateJobRoleSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateJobRoleInput } from './inputs.js';

export interface UpdateJobRoleArgs {
  id: string;
  name?: string | null;
  color?: string | null;
}

const ADMIN_ROLES: readonly string[] = ['OWNER', 'ADMIN'];

export async function resolveUpdateJobRole(
  query: object,
  input: UpdateJobRoleArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ADMIN_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only admins can update job roles');
  }
  const tenantId = ctx.auth.tenant.id;
  const existing = await ctx.prisma.jobRole.findFirst({
    where: { id: input.id, tenantId },
    select: { id: true, name: true },
  });
  if (!existing) throw new NotFoundError('Job role not found');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.color !== undefined && input.color !== null) data.color = input.color;
  if (input.name && input.name !== existing.name) {
    const dup = await ctx.prisma.jobRole.findFirst({
      where: { tenantId, name: input.name },
      select: { id: true },
    });
    if (dup) throw new ConflictError('A job role with that name already exists');
  }
  const updated = (await ctx.prisma.jobRole.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'job_role.updated',
    resourceType: 'job_role',
    resourceId: updated.id,
    metadata: data,
  });
  return updated;
}

builder.mutationField('updateJobRole', (t) =>
  t.prismaField({
    type: 'JobRole',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UpdateJobRoleInput, required: true }) },
    validate: { schema: z.object({ input: updateJobRoleSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateJobRole(query, args.input as UpdateJobRoleArgs, ctx) as never,
  }),
);
