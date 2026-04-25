import { updateMembershipRoleSchema } from '@repo/validation/membership';
import { z } from 'zod';
import { writeAudit } from '../../audit.js';
import type { RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import { builder } from '../builder.js';
import { RoleEnum } from '../enums.js';

export const UpdateMembershipRoleInput = builder.inputType('UpdateMembershipRoleInput', {
  fields: (t) => ({
    membershipId: t.string({ required: true }),
    role: t.field({ type: RoleEnum, required: true }),
  }),
});

export interface UpdateMembershipRoleArgs {
  membershipId: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
}

export async function resolveUpdateMembershipRole(
  query: object,
  input: UpdateMembershipRoleArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can update membership roles');
  }
  const tenantId = ctx.auth.tenant.id;
  const membership = await ctx.prisma.membership.findUnique({
    where: { id: input.membershipId },
  });
  if (!membership) throw new NotFoundError('Membership not found');
  if (membership.tenantId !== tenantId) {
    throw new NotFoundError('Membership not found');
  }

  // Forbid demoting the last active OWNER.
  if (membership.role === 'OWNER' && input.role !== 'OWNER') {
    const activeOwners = await ctx.prisma.membership.count({
      where: { tenantId, role: 'OWNER', status: 'ACTIVE' },
    });
    if (activeOwners <= 1) {
      throw new ConflictError('Cannot demote the last active OWNER of this tenant');
    }
  }

  const updated = await ctx.prisma.membership.update({
    ...query,
    where: { id: input.membershipId },
    data: { role: input.role },
  });

  await writeAudit(ctx, {
    action: 'membership.role_updated',
    resourceType: 'membership',
    resourceId: (updated as { id: string }).id,
    metadata: { previousRole: membership.role, newRole: input.role },
  });
  return updated;
}

builder.mutationField('updateMembershipRole', (t) =>
  t.prismaField({
    type: 'Membership',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UpdateMembershipRoleInput, required: true }) },
    validate: { schema: z.object({ input: updateMembershipRoleSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateMembershipRole(query, args.input as UpdateMembershipRoleArgs, ctx) as never,
  }),
);
