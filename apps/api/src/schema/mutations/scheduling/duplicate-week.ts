import { duplicateWeekSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { computeWeekRange } from '../../shift.js';
import { ShiftRef } from '../../shift.js';
import { DuplicateWeekInput } from './inputs.js';

export interface DuplicateWeekArgs {
  locationId: string;
  weekStart: Date;
  targetWeekStart: Date;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

/**
 * Pure: shift the offset between source weekStart and target weekStart
 * onto every (startsAt, endsAt) pair, preserving relative timing within
 * the week.
 */
export function computeWeekOffsetMs(
  sourceWeekStart: Date,
  targetWeekStart: Date,
): number {
  return targetWeekStart.getTime() - sourceWeekStart.getTime();
}

export async function resolveDuplicateWeek(
  input: DuplicateWeekArgs,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can duplicate a week');
  }
  const location = await ctx.prisma.location.findFirst({
    where: { id: input.locationId, tenantId: ctx.auth.tenant.id },
    select: { id: true, timezone: true },
  });
  if (!location) throw new NotFoundError('Location not found');

  const { start: srcStart, end: srcEnd } = computeWeekRange(
    input.weekStart,
    location.timezone,
  );
  const offset = computeWeekOffsetMs(input.weekStart, input.targetWeekStart);

  const sourceShifts = (await ctx.prisma.shift.findMany({
    where: {
      locationId: location.id,
      status: 'PUBLISHED',
      startsAt: { gte: srcStart, lt: srcEnd },
    },
    select: {
      userId: true,
      jobRoleId: true,
      startsAt: true,
      endsAt: true,
      notes: true,
    },
  })) as Array<{
    userId: string;
    jobRoleId: string;
    startsAt: Date;
    endsAt: Date;
    notes: string | null;
  }>;

  if (sourceShifts.length === 0) {
    await writeAudit(ctx, {
      action: 'schedule.week_duplicated',
      resourceType: 'location',
      resourceId: location.id,
      metadata: {
        weekStart: input.weekStart,
        targetWeekStart: input.targetWeekStart,
        count: 0,
      },
    });
    return [];
  }

  const created = await ctx.prisma.$transaction(async (tx) => {
    const insertedIds: string[] = [];
    for (const s of sourceShifts) {
      const c = (await tx.shift.create({
        data: {
          locationId: location.id,
          userId: s.userId,
          jobRoleId: s.jobRoleId,
          startsAt: new Date(s.startsAt.getTime() + offset),
          endsAt: new Date(s.endsAt.getTime() + offset),
          status: 'DRAFT',
          notes: s.notes,
          createdById: ctx.auth.kind === 'authenticated' ? ctx.auth.user.id : '',
        },
        select: { id: true },
      })) as { id: string };
      insertedIds.push(c.id);
    }
    return tx.shift.findMany({
      where: { id: { in: insertedIds } },
      orderBy: { startsAt: 'asc' },
    });
  });

  const createdRows = created as Array<{ id: string }>;
  await writeAudit(ctx, {
    action: 'schedule.week_duplicated',
    resourceType: 'location',
    resourceId: location.id,
    metadata: {
      weekStart: input.weekStart,
      targetWeekStart: input.targetWeekStart,
      count: createdRows.length,
    },
  });
  for (const row of createdRows) {
    await pubsub.publish(scheduleChannelName(location.id), {
      kind: 'ShiftChanged',
      shiftId: row.id,
    });
  }
  return createdRows;
}

builder.mutationField('duplicateWeek', (t) =>
  t.field({
    type: [ShiftRef],
    authScopes: { manager: true },
    args: { input: t.arg({ type: DuplicateWeekInput, required: true }) },
    validate: { schema: z.object({ input: duplicateWeekSchema }) },
    resolve: (_root, args, ctx) =>
      resolveDuplicateWeek(args.input as DuplicateWeekArgs, ctx) as never,
  }),
);
