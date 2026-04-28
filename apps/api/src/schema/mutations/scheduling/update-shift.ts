import { updateShiftSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { detectShiftOverlap } from '../../../scheduling/overlap.js';
import { builder } from '../../builder.js';
import { UpdateShiftInput } from './inputs.js';

export interface UpdateShiftArgs {
  id: string;
  userId?: string | null;
  jobRoleId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  notes?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveUpdateShift(
  query: object,
  input: UpdateShiftArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can update shifts');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;

  const existing = (await ctx.prisma.shift.findFirst({
    where: { id: input.id, locationId },
    select: {
      id: true,
      userId: true,
      jobRoleId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  })) as
    | {
        id: string;
        userId: string;
        jobRoleId: string;
        startsAt: Date;
        endsAt: Date;
        status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
      }
    | null;
  if (!existing) throw new NotFoundError('Shift not found');

  if (input.userId && input.userId !== existing.userId) {
    const membership = await ctx.prisma.membership.findFirst({
      where: { userId: input.userId, tenantId },
      select: { id: true },
    });
    if (!membership) throw new NotFoundError('User not found in tenant');
  }
  if (input.jobRoleId && input.jobRoleId !== existing.jobRoleId) {
    const jobRole = await ctx.prisma.jobRole.findFirst({
      where: { id: input.jobRoleId, tenantId },
      select: { id: true },
    });
    if (!jobRole) throw new NotFoundError('Job role not found');
  }

  const nextUserId = input.userId ?? existing.userId;
  const nextStartsAt = input.startsAt ?? existing.startsAt;
  const nextEndsAt = input.endsAt ?? existing.endsAt;

  // Overlap check, excluding self.
  const others = (await ctx.prisma.shift.findMany({
    where: { locationId, userId: nextUserId },
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
      userId: nextUserId,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
    },
    existing: others,
    excludeId: existing.id,
  });
  if (overlaps.length > 0) {
    throw new ConflictError('Shift overlaps an existing shift for this user');
  }

  const data: Record<string, unknown> = {};
  if (input.userId !== undefined && input.userId !== null) data.userId = input.userId;
  if (input.jobRoleId !== undefined && input.jobRoleId !== null) {
    data.jobRoleId = input.jobRoleId;
  }
  if (input.startsAt !== undefined && input.startsAt !== null) {
    data.startsAt = input.startsAt;
  }
  if (input.endsAt !== undefined && input.endsAt !== null) {
    data.endsAt = input.endsAt;
  }
  if (input.notes !== undefined) data.notes = input.notes;

  const updated = (await ctx.prisma.shift.update({
    ...query,
    where: { id: existing.id },
    data,
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'shift.updated',
    resourceType: 'shift',
    resourceId: updated.id,
    metadata: data,
  });
  await pubsub.publish(scheduleChannelName(locationId), {
    kind: 'ShiftChanged',
    shiftId: updated.id,
  });
  return updated;
}

builder.mutationField('updateShift', (t) =>
  t.prismaField({
    type: 'Shift',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateShiftInput, required: true }) },
    validate: { schema: z.object({ input: updateShiftSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateShift(query, args.input as UpdateShiftArgs, ctx) as never,
  }),
);
