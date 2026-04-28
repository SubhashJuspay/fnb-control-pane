import { endEmploymentSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { EndEmploymentInput } from './inputs.js';

export interface EndEmploymentArgs {
  id: string;
  terminationDate: Date;
}

const ADMIN_ROLES: readonly string[] = ['OWNER', 'ADMIN'];

export async function resolveEndEmployment(
  query: object,
  input: EndEmploymentArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ADMIN_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only admins can end employment');
  }
  const tenantId = ctx.auth.tenant.id;
  // Verify the profile belongs to a location in viewer's tenant.
  const profile = await ctx.prisma.employmentProfile.findFirst({
    where: { id: input.id, location: { tenantId } },
    select: { id: true },
  });
  if (!profile) throw new NotFoundError('Employment profile not found');
  const updated = (await ctx.prisma.employmentProfile.update({
    ...query,
    where: { id: input.id },
    data: { terminationDate: input.terminationDate },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'employment.ended',
    resourceType: 'employment_profile',
    resourceId: updated.id,
    metadata: { terminationDate: input.terminationDate },
  });
  return updated;
}

builder.mutationField('endEmployment', (t) =>
  t.prismaField({
    type: 'EmploymentProfile',
    authScopes: { admin: true },
    args: { input: t.arg({ type: EndEmploymentInput, required: true }) },
    validate: { schema: z.object({ input: endEmploymentSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveEndEmployment(query, args.input as EndEmploymentArgs, ctx) as never,
  }),
);
