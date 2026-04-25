import { z } from 'zod';
import { writeAudit } from '../../audit.js';
import type { RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import { builder } from '../builder.js';

export const RevokeInvitationInput = builder.inputType('RevokeInvitationInput', {
  fields: (t) => ({
    invitationId: t.string({ required: true }),
  }),
});

export const revokeInvitationSchema = z.object({
  invitationId: z.string().uuid(),
});

export interface RevokeInvitationArgs {
  invitationId: string;
}

/**
 * Pure resolver for revokeInvitation. Hard-deletes the invitation row since
 * it has not been accepted yet. Audit log captures the deletion.
 */
export async function resolveRevokeInvitation(
  input: RevokeInvitationArgs,
  ctx: RequestContext,
): Promise<{ id: string }> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can revoke invitations');
  }
  const tenantId = ctx.auth.tenant.id;
  const invitation = await ctx.prisma.invitation.findUnique({
    where: { id: input.invitationId },
    select: { id: true, tenantId: true, email: true, role: true, acceptedAt: true },
  });
  if (!invitation || invitation.tenantId !== tenantId) {
    throw new NotFoundError('Invitation not found');
  }
  if (invitation.acceptedAt) {
    throw new ConflictError('Cannot revoke an already-accepted invitation');
  }
  await ctx.prisma.invitation.delete({ where: { id: invitation.id } });
  await writeAudit(ctx, {
    action: 'invitation.revoked',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role },
  });
  return { id: invitation.id };
}

const RevokeInvitationResult = builder.objectRef<{ id: string }>(
  'RevokeInvitationResult',
);
RevokeInvitationResult.implement({
  description: 'Result of revoking an invitation: the id of the deleted row.',
  fields: (t) => ({
    id: t.exposeID('id'),
  }),
});

builder.mutationField('revokeInvitation', (t) =>
  t.field({
    type: RevokeInvitationResult,
    authScopes: { admin: true },
    args: { input: t.arg({ type: RevokeInvitationInput, required: true }) },
    validate: { schema: z.object({ input: revokeInvitationSchema }) },
    resolve: (_root, args, ctx) =>
      resolveRevokeInvitation(args.input as RevokeInvitationArgs, ctx),
  }),
);
