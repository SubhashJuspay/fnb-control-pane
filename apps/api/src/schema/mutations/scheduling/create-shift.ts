import { createShiftSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { detectShiftOverlap } from '../../../scheduling/overlap.js';
import { builder } from '../../builder.js';
import { CreateShiftInput } from './inputs.js';

export interface CreateShiftArgs {
  userId: string;
  jobRoleId: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveCreateShift(
  query: object,
  input: CreateShiftArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can create shifts');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;

  // Verify the user is a member of the viewer's tenant.
  const membership = await ctx.prisma.membership.findFirst({
    where: { userId: input.userId, tenantId },
    select: { id: true },
  });
  if (!membership) throw new NotFoundError('User not found in tenant');

  // Verify the job role belongs to the tenant.
  const jobRole = await ctx.prisma.jobRole.findFirst({
    where: { id: input.jobRoleId, tenantId },
    select: { id: true },
  });
  if (!jobRole) throw new NotFoundError('Job role not found');

  // Overlap check against existing shifts at this location for the user.
  const existing = (await ctx.prisma.shift.findMany({
    where: { locationId, userId: input.userId },
    select: {
      id: true,
      userId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  })) as Array<{
    id: string;
    userId: string;
    startsAt: Date;
    endsAt: Date;
    status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  }>;
  const overlaps = detectShiftOverlap({
    candidate: {
      userId: input.userId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
    existing,
  });
  if (overlaps.length > 0) {
    throw new ConflictError('Shift overlaps an existing shift for this user');
  }

  const created = (await ctx.prisma.shift.create({
    ...query,
    data: {
      locationId,
      userId: input.userId,
      jobRoleId: input.jobRoleId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: 'DRAFT',
      notes: input.notes ?? null,
      createdById: ctx.auth.user.id,
    },
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'shift.created',
    resourceType: 'shift',
    resourceId: created.id,
    metadata: {
      userId: input.userId,
      jobRoleId: input.jobRoleId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
  });
  await pubsub.publish(scheduleChannelName(locationId), {
    kind: 'ShiftChanged',
    shiftId: created.id,
  });
  return created;
}

builder.mutationField('createShift', (t) =>
  t.prismaField({
    type: 'Shift',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CreateShiftInput, required: true }) },
    validate: { schema: z.object({ input: createShiftSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateShift(query, args.input as CreateShiftArgs, ctx) as never,
  }),
);
