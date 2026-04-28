import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import { EmploymentTypeEnum } from './enums.js';

export type EmploymentProfileRow = {
  id: string;
  userId: string;
  locationId: string;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR';
  hourlyRateCents: number | null;
  hireDate: Date;
  terminationDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];
const ADMIN_ROLES: readonly string[] = ['OWNER', 'ADMIN'];

/** Pure resolver for `Query.staffRoster`. Manager scope at viewer location. */
export async function resolveStaffRoster(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can view the staff roster');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.employmentProfile.findMany({
    ...query,
    where: { locationId: ctx.auth.location.id },
    orderBy: [{ terminationDate: 'asc' }, { hireDate: 'desc' }],
  });
}

/**
 * Pure resolver for `Query.employmentProfile(userId)`. Returns null when no
 * profile exists. Visible to admins (any user in the tenant) or to the
 * viewing user querying their own profile.
 */
export async function resolveEmploymentProfile(
  query: object,
  ctx: RequestContext,
  userId: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const isSelf = ctx.auth.user.id === userId;
  if (!isSelf && !ADMIN_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only admins can read other users employment profiles');
  }
  return ctx.prisma.employmentProfile.findFirst({
    ...query,
    where: { userId, locationId: ctx.auth.location.id },
  });
}

export const EmploymentProfileRef = builder.prismaObject('EmploymentProfile', {
  fields: (t) => ({
    id: t.exposeID('id'),
    employmentType: t.field({
      type: EmploymentTypeEnum,
      resolve: (parent) => parent.employmentType,
    }),
    hourlyRateCents: t.exposeInt('hourlyRateCents', { nullable: true }),
    hireDate: t.expose('hireDate', { type: 'DateTime' }),
    terminationDate: t.expose('terminationDate', { type: 'DateTime', nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    user: t.relation('user', { authScopes: { manager: true } }),
    location: t.relation('location', { authScopes: { manager: true } }),
  }),
});

builder.queryField('staffRoster', (t) =>
  t.prismaField({
    type: ['EmploymentProfile'],
    description:
      "Employment profiles at the viewer's location. Manager scope. Active first, ordered by hireDate desc.",
    authScopes: { manager: true },
    resolve: (query, _root, _args, ctx) => resolveStaffRoster(query, ctx) as never,
  }),
);

builder.queryField('employmentProfile', (t) =>
  t.prismaField({
    type: 'EmploymentProfile',
    nullable: true,
    description:
      "Single employment profile for a user at the viewer's location. Admin or self.",
    authScopes: { authenticated: true },
    args: { userId: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveEmploymentProfile(query, ctx, args.userId as string) as never,
  }),
);
