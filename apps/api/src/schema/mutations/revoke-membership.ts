import { revokeMembershipSchema } from '@repo/validation/membership';
import { z } from 'zod';
import { writeAudit } from '../../audit.js';
import type { RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import { builder } from '../builder.js';

export const RevokeMembershipInput = builder.inputType('RevokeMembershipInput', {
  fields: (t) => ({
    membershipId: t.string({ required: true }),
  }),
});

export interface RevokeMembershipArgs {
  membershipId: string;
}

/** Pure resolver for revokeMembership — extracted for direct unit testing. */
export async function resolveRevokeMembership(
  query: object,
  input: RevokeMembershipArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can revoke memberships');
  }
  const tenantId = ctx.auth.tenant.id;
  const membership = await ctx.prisma.membership.findUnique({
    where: { id: input.membershipId },
  });
  if (!membership) throw new NotFoundError('Membership not found');
  if (membership.tenantId !== tenantId) {
    throw new NotFoundError('Membership not found');
  }
  if (membership.role === 'OWNER') {
    const activeOwners = await ctx.prisma.membership.count({
      where: { tenantId, role: 'OWNER', status: 'ACTIVE' },
    });
    if (activeOwners <= 1) {
      throw new ConflictError('Cannot revoke the last active OWNER of this tenant');
    }
  }

  const updated = await ctx.prisma.membership.update({
    ...query,
    where: { id: input.membershipId },
    data: { status: 'REVOKED' },
  });

  await writeAudit(ctx, {
    action: 'membership.revoked',
    resourceType: 'membership',
    resourceId: (updated as { id: string }).id,
  });
  return updated;
}

builder.mutationField('revokeMembership', (t) =>
  t.prismaField({
    type: 'Membership',
    authScopes: { admin: true },
    args: { input: t.arg({ type: RevokeMembershipInput, required: true }) },
    validate: { schema: z.object({ input: revokeMembershipSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveRevokeMembership(query, args.input as RevokeMembershipArgs, ctx) as never,
  }),
);
