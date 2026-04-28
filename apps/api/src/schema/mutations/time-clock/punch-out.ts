import { punchOutSchema } from '@repo/validation/time-clock';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { PunchOutInput } from './inputs.js';

export interface PunchOutArgs {
  timeEntryId: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

/**
 * Pure: sum total minutes from break rows. Treats unfinished breaks as ending
 * at `now`. Floored to ints.
 */
export function sumBreakMinutes(
  breaks: Array<{ startedAt: Date; endedAt: Date | null }>,
  now: Date,
): number {
  let total = 0;
  for (const b of breaks) {
    const end = b.endedAt ?? now;
    const delta = end.getTime() - b.startedAt.getTime();
    if (delta > 0) total += Math.floor(delta / 60_000);
  }
  return total;
}

export async function resolvePunchOut(
  query: object,
  input: PunchOutArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only staff or above can punch out');
  }
  const userId = ctx.auth.user.id;
  const entry = (await ctx.prisma.timeEntry.findFirst({
    where: { id: input.timeEntryId, userId },
    select: {
      id: true,
      clockedOutAt: true,
      locationId: true,
    },
  })) as { id: string; clockedOutAt: Date | null; locationId: string } | null;
  if (!entry) throw new NotFoundError('Time entry not found');
  if (entry.clockedOutAt) {
    throw new ConflictError('Time entry is already closed');
  }

  const now = new Date();
  const breaks = (await ctx.prisma.break.findMany({
    where: { timeEntryId: entry.id },
    select: { startedAt: true, endedAt: true },
  })) as Array<{ startedAt: Date; endedAt: Date | null }>;
  // Auto-close any open break before computing total minutes.
  const openIds = (await ctx.prisma.break.findMany({
    where: { timeEntryId: entry.id, endedAt: null },
    select: { id: true },
  })) as Array<{ id: string }>;
  if (openIds.length > 0) {
    await ctx.prisma.break.updateMany({
      where: { id: { in: openIds.map((b) => b.id) } },
      data: { endedAt: now },
    });
  }
  const totalBreakMinutes = sumBreakMinutes(breaks, now);

  const updated = (await ctx.prisma.timeEntry.update({
    ...query,
    where: { id: entry.id },
    data: {
      clockedOutAt: now,
      totalBreakMinutes,
    },
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'time_entry.punched_out',
    resourceType: 'time_entry',
    resourceId: updated.id,
    metadata: { totalBreakMinutes },
  });
  await pubsub.publish(scheduleChannelName(entry.locationId), {
    kind: 'TimeEntryChanged',
    timeEntryId: updated.id,
    userId,
  });
  return updated;
}

builder.mutationField('punchOut', (t) =>
  t.prismaField({
    type: 'TimeEntry',
    authScopes: { staff: true },
    args: { input: t.arg({ type: PunchOutInput, required: true }) },
    validate: { schema: z.object({ input: punchOutSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolvePunchOut(query, args.input as PunchOutArgs, ctx) as never,
  }),
);
