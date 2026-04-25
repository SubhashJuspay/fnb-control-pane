import { acceptInvitationSchema } from '@repo/validation/invitation';
import { z } from 'zod';
import { writeAnonymousAudit } from '../../audit.js';
import type { RequestContext } from '../../context.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import { hashPassword } from '../../password.js';
import { hashToken } from '../../tokens.js';
import { builder } from '../builder.js';

export const AcceptInvitationInput = builder.inputType('AcceptInvitationInput', {
  fields: (t) => ({
    token: t.string({ required: true }),
    name: t.string({ required: true }),
    password: t.string({ required: true }),
  }),
});

export interface AcceptInvitationArgs {
  token: string;
  name: string;
  password: string;
}

/**
 * Pure resolver for acceptInvitation. This is the explicit anonymous-mutation
 * exception in the schema: it has no `authScopes` requirement because the
 * invitation token IS the auth credential. Validation by token alone.
 */
export async function resolveAcceptInvitation(
  query: object,
  input: AcceptInvitationArgs,
  ctx: RequestContext,
): Promise<unknown> {
  const tokenHash = hashToken(input.token);
  const invitation = await ctx.prisma.invitation.findUnique({
    where: { tokenHash },
  });
  if (!invitation) throw new NotFoundError('Invitation not found');
  if (invitation.acceptedAt) {
    throw new ConflictError('Invitation has already been accepted');
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new ConflictError('Invitation has expired');
  }

  // Find or create the user. If a user already exists with this email but the
  // invitation is for a different tenant, reuse the user.
  const existingUser = await ctx.prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, passwordHash: true },
  });

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    // If user has no password yet (shouldn't happen normally), set one.
    if (!existingUser.passwordHash) {
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashPassword(input.password), name: input.name },
      });
    }
  } else {
    const created = await ctx.prisma.user.create({
      data: {
        email: invitation.email,
        name: input.name,
        passwordHash: hashPassword(input.password),
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    userId = created.id;
  }

  // Create the membership (skip if it already exists).
  const existingMembership = await ctx.prisma.membership.findFirst({
    where: {
      userId,
      tenantId: invitation.tenantId,
      locationId: invitation.locationId,
    },
  });
  if (!existingMembership) {
    await ctx.prisma.membership.create({
      data: {
        userId,
        tenantId: invitation.tenantId,
        locationId: invitation.locationId,
        role: invitation.role,
      },
    });
  } else if (existingMembership.status !== 'ACTIVE') {
    await ctx.prisma.membership.update({
      where: { id: existingMembership.id },
      data: { status: 'ACTIVE', role: invitation.role },
    });
  }

  await ctx.prisma.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  await writeAnonymousAudit(ctx, {
    action: 'invitation.accepted',
    resourceType: 'invitation',
    resourceId: invitation.id,
    tenantId: invitation.tenantId,
    locationId: invitation.locationId,
    actorUserId: userId,
    metadata: { email: invitation.email, role: invitation.role },
  });

  return ctx.prisma.user.findUniqueOrThrow({
    ...query,
    where: { id: userId },
  });
}

// NOTE: acceptInvitation is the documented anonymous-allowed mutation. We
// deliberately omit `authScopes` — the invitation token itself is the auth
// credential. Do not add scope checks here.
builder.mutationField('acceptInvitation', (t) =>
  t.prismaField({
    type: 'User',
    args: { input: t.arg({ type: AcceptInvitationInput, required: true }) },
    validate: { schema: z.object({ input: acceptInvitationSchema }) },
    skipTypeScopes: true,
    authScopes: {},
    resolve: (query, _root, args, ctx) =>
      resolveAcceptInvitation(query, args.input as AcceptInvitationArgs, ctx) as never,
  }),
);
