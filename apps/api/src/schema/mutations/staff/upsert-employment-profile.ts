import { upsertEmploymentProfileSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpsertEmploymentProfileInput } from './inputs.js';

export interface UpsertEmploymentProfileArgs {
  userId: string;
  locationId: string;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR';
  hourlyRateCents?: number | null;
  hireDate: Date;
  terminationDate?: Date | null;
  notes?: string | null;
}

const ADMIN_ROLES: readonly string[] = ['OWNER', 'ADMIN'];

export async function resolveUpsertEmploymentProfile(
  query: object,
  input: UpsertEmploymentProfileArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ADMIN_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only admins can manage employment profiles');
  }
  const tenantId = ctx.auth.tenant.id;
  // Verify location belongs to viewer tenant.
  const location = await ctx.prisma.location.findFirst({
    where: { id: input.locationId, tenantId },
    select: { id: true },
  });
  if (!location) throw new NotFoundError('Location not found');
  // Verify the target user has an active membership in this tenant.
  const membership = await ctx.prisma.membership.findFirst({
    where: { userId: input.userId, tenantId },
    select: { id: true },
  });
  if (!membership) throw new NotFoundError('User not found in tenant');
  const data = {
    userId: input.userId,
    locationId: input.locationId,
    employmentType: input.employmentType,
    hourlyRateCents: input.hourlyRateCents ?? null,
    hireDate: input.hireDate,
    terminationDate: input.terminationDate ?? null,
    notes: input.notes ?? null,
  };
  const upserted = (await ctx.prisma.employmentProfile.upsert({
    ...query,
    where: {
      userId_locationId: { userId: input.userId, locationId: input.locationId },
    },
    create: data,
    update: {
      employmentType: data.employmentType,
      hourlyRateCents: data.hourlyRateCents,
      hireDate: data.hireDate,
      terminationDate: data.terminationDate,
      notes: data.notes,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'employment.upserted',
    resourceType: 'employment_profile',
    resourceId: upserted.id,
    metadata: {
      userId: input.userId,
      locationId: input.locationId,
      employmentType: input.employmentType,
    },
  });
  return upserted;
}

builder.mutationField('upsertEmploymentProfile', (t) =>
  t.prismaField({
    type: 'EmploymentProfile',
    authScopes: { admin: true },
    args: { input: t.arg({ type: UpsertEmploymentProfileInput, required: true }) },
    validate: { schema: z.object({ input: upsertEmploymentProfileSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpsertEmploymentProfile(
        query,
        args.input as UpsertEmploymentProfileArgs,
        ctx,
      ) as never,
  }),
);
