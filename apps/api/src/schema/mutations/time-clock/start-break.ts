import { startBreakSchema } from '@repo/validation/time-clock';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { StartBreakInput } from './inputs.js';

export interface StartBreakArgs {
  timeEntryId: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveStartBreak(
  query: object,
  input: StartBreakArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only staff or above can take breaks');
  }
  const userId = ctx.auth.user.id;
  const entry = (await ctx.prisma.timeEntry.findFirst({
    where: { id: input.timeEntryId, userId },
    select: { id: true, clockedOutAt: true, locationId: true },
  })) as
    | { id: string; clockedOutAt: Date | null; locationId: string }
    | null;
  if (!entry) throw new NotFoundError('Time entry not found');
  if (entry.clockedOutAt) {
    throw new ConflictError('Cannot start a break on a closed time entry');
  }
  const open = await ctx.prisma.break.findFirst({
    where: { timeEntryId: entry.id, endedAt: null },
    select: { id: true },
  });
  if (open) throw new ConflictError('A break is already in progress');
  const created = (await ctx.prisma.break.create({
    ...query,
    data: { timeEntryId: entry.id, startedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'time_entry.break_started',
    resourceType: 'break',
    resourceId: created.id,
    metadata: { timeEntryId: entry.id },
  });
  await pubsub.publish(scheduleChannelName(entry.locationId), {
    kind: 'TimeEntryChanged',
    timeEntryId: entry.id,
    userId,
  });
  return created;
}

builder.mutationField('startBreak', (t) =>
  t.prismaField({
    type: 'Break',
    authScopes: { staff: true },
    args: { input: t.arg({ type: StartBreakInput, required: true }) },
    validate: { schema: z.object({ input: startBreakSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveStartBreak(query, args.input as StartBreakArgs, ctx) as never,
  }),
);
