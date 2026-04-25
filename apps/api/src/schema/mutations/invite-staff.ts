import { inviteStaffSchema } from '@repo/validation/invitation';
import { z } from 'zod';
import { writeAudit } from '../../audit.js';
import type { RequestContext } from '../../context.js';
import { sendEmail } from '../../email/client.js';
import { invitationEmail } from '../../email/templates.js';
import { env } from '../../env.js';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { generateInvitationToken } from '../../tokens.js';
import { builder } from '../builder.js';
import { RoleEnum } from '../enums.js';

export const InviteStaffInput = builder.inputType('InviteStaffInput', {
  fields: (t) => ({
    email: t.string({ required: true }),
    role: t.field({ type: RoleEnum, required: true }),
    locationId: t.string({ required: false }),
  }),
});

export interface InviteStaffArgs {
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
  locationId?: string | null;
}

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Pure resolver for inviteStaff — extracted for direct unit testing. */
export async function resolveInviteStaff(
  query: object,
  input: InviteStaffArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers and above can invite staff');
  }
  const tenantId = ctx.auth.tenant.id;

  // Reject if a user with this email already has an ACTIVE membership in this tenant.
  const existingUser = await ctx.prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existingUser) {
    const existingMembership = await ctx.prisma.membership.findFirst({
      where: { userId: existingUser.id, tenantId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (existingMembership) {
      throw new ConflictError('That user already has an active membership in this tenant');
    }
  }

  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });
  const locationName = input.locationId
    ? (
        await ctx.prisma.location.findUnique({
          where: { id: input.locationId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  const invitation = await ctx.prisma.invitation.create({
    ...query,
    data: {
      tenantId,
      locationId: input.locationId ?? null,
      email: input.email,
      role: input.role,
      tokenHash,
      invitedById: ctx.auth.user.id,
      expiresAt,
    },
  });

  const inviteUrl = `${env.AUTH_URL}/sign-up/${token}`;
  const rendered = invitationEmail({
    inviteUrl,
    tenantName: tenant.name,
    role: input.role,
    locationName,
  });
  await sendEmail(input.email, rendered.subject, rendered.html, rendered.text);

  await writeAudit(ctx, {
    action: 'invitation.created',
    resourceType: 'invitation',
    resourceId: (invitation as { id: string }).id,
    metadata: { email: input.email, role: input.role, locationId: input.locationId ?? null },
  });
  return invitation;
}

builder.mutationField('inviteStaff', (t) =>
  t.prismaField({
    type: 'Invitation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: InviteStaffInput, required: true }) },
    validate: { schema: z.object({ input: inviteStaffSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveInviteStaff(query, args.input as InviteStaffArgs, ctx) as never,
  }),
);
