import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { RoleEnum } from './enums.js';
import { hashToken } from '../tokens.js';

export const InvitationRef = builder.prismaObject('Invitation', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    role: t.field({
      type: RoleEnum,
      resolve: (parent) => parent.role,
    }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime' }),
    acceptedAt: t.expose('acceptedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    tenant: t.relation('tenant'),
    location: t.relation('location', { nullable: true }),
  }),
});

export interface InvitationLookupShape {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
  tenantName: string;
  locationName: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
}

const InvitationLookup = builder.objectRef<InvitationLookupShape>('InvitationLookup');
InvitationLookup.implement({
  description: 'Sanitized view of an Invitation suitable for the public sign-up page.',
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    role: t.field({
      type: RoleEnum,
      resolve: (parent) => parent.role,
    }),
    tenantName: t.exposeString('tenantName'),
    locationName: t.exposeString('locationName', { nullable: true }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime' }),
    acceptedAt: t.expose('acceptedAt', { type: 'DateTime', nullable: true }),
  }),
});

export async function resolveInvitationByToken(
  token: string,
  ctx: RequestContext,
): Promise<InvitationLookupShape | null> {
  const tokenHash = hashToken(token);
  const inv = await ctx.prisma.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      tenant: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!inv) return null;
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    tenantName: inv.tenant.name,
    locationName: inv.location?.name ?? null,
    expiresAt: inv.expiresAt,
    acceptedAt: inv.acceptedAt,
  };
}

builder.queryField('invitationByToken', (t) =>
  t.field({
    type: InvitationLookup,
    nullable: true,
    description: 'Look up an invitation by its single-use token. Anonymous-allowed.',
    args: { token: t.arg.string({ required: true }) },
    resolve: (_root, args, ctx) => resolveInvitationByToken(args.token, ctx),
  }),
);

/** Pure resolver for tenantInvitations — extracted for direct unit testing. */
export async function resolveTenantInvitations(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.invitation.findMany({
    ...query,
    where: {
      tenantId: ctx.auth.tenant.id,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}

builder.queryField('tenantInvitations', (t) =>
  t.prismaField({
    type: ['Invitation'],
    description: 'Pending (unaccepted, unexpired) invitations within the current tenant.',
    authScopes: { admin: true },
    resolve: (query, _root, _args, ctx) => resolveTenantInvitations(query, ctx) as never,
  }),
);
