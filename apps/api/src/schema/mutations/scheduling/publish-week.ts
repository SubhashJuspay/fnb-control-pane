import { publishWeekSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { computeWeekRange } from '../../shift.js';
import { ShiftRef } from '../../shift.js';
import { PublishWeekInput } from './inputs.js';

export interface PublishWeekArgs {
  locationId: string;
  weekStart: Date;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolvePublishWeek(
  input: PublishWeekArgs,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can publish a week');
  }
  // Validate the location belongs to the viewer's tenant.
  const location = await ctx.prisma.location.findFirst({
    where: { id: input.locationId, tenantId: ctx.auth.tenant.id },
    select: { id: true, timezone: true },
  });
  if (!location) throw new NotFoundError('Location not found');
  const { start, end } = computeWeekRange(input.weekStart, location.timezone);

  const draftShifts = (await ctx.prisma.shift.findMany({
    where: {
      locationId: location.id,
      status: 'DRAFT',
      startsAt: { gte: start, lt: end },
    },
    select: { id: true },
  })) as Array<{ id: string }>;
  const ids = draftShifts.map((s) => s.id);
  if (ids.length === 0) {
    await writeAudit(ctx, {
      action: 'schedule.week_published',
      resourceType: 'location',
      resourceId: location.id,
      metadata: { weekStart: input.weekStart, count: 0 },
    });
    return [];
  }

  await ctx.prisma.shift.updateMany({
    where: { id: { in: ids } },
    data: { status: 'PUBLISHED' },
  });

  const published = await ctx.prisma.shift.findMany({
    where: { id: { in: ids } },
    orderBy: { startsAt: 'asc' },
  });

  await writeAudit(ctx, {
    action: 'schedule.week_published',
    resourceType: 'location',
    resourceId: location.id,
    metadata: { weekStart: input.weekStart, count: ids.length },
  });
  for (const id of ids) {
    await pubsub.publish(scheduleChannelName(location.id), {
      kind: 'ShiftChanged',
      shiftId: id,
    });
  }
  return published;
}

builder.mutationField('publishWeek', (t) =>
  t.field({
    type: [ShiftRef],
    authScopes: { manager: true },
    args: { input: t.arg({ type: PublishWeekInput, required: true }) },
    validate: { schema: z.object({ input: publishWeekSchema }) },
    resolve: (_root, args, ctx) =>
      resolvePublishWeek(args.input as PublishWeekArgs, ctx) as never,
  }),
);
