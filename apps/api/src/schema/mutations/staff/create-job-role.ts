import { createJobRoleSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateJobRoleInput } from './inputs.js';

export interface CreateJobRoleArgs {
  name: string;
  color?: string | null;
}

const ADMIN_ROLES: readonly string[] = ['OWNER', 'ADMIN'];

export async function resolveCreateJobRole(
  query: object,
  input: CreateJobRoleArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ADMIN_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only admins can create job roles');
  }
  const tenantId = ctx.auth.tenant.id;
  const existing = await ctx.prisma.jobRole.findFirst({
    where: { tenantId, name: input.name },
    select: { id: true },
  });
  if (existing) throw new ConflictError('A job role with that name already exists');
  const created = (await ctx.prisma.jobRole.create({
    ...query,
    data: {
      tenantId,
      name: input.name,
      color: input.color ?? '#6366f1',
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'job_role.created',
    resourceType: 'job_role',
    resourceId: created.id,
    metadata: { name: input.name },
  });
  return created;
}

builder.mutationField('createJobRole', (t) =>
  t.prismaField({
    type: 'JobRole',
    authScopes: { admin: true },
    args: { input: t.arg({ type: CreateJobRoleInput, required: true }) },
    validate: { schema: z.object({ input: createJobRoleSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateJobRole(query, args.input as CreateJobRoleArgs, ctx) as never,
  }),
);
