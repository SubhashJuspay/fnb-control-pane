import { endBreakSchema } from '@repo/validation/time-clock';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { EndBreakInput } from './inputs.js';

export interface EndBreakArgs {
  breakId: string;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveEndBreak(
  query: object,
  input: EndBreakArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only staff or above can take breaks');
  }
  const userId = ctx.auth.user.id;
  const row = (await ctx.prisma.break.findFirst({
    where: { id: input.breakId, timeEntry: { userId } },
    select: {
      id: true,
      endedAt: true,
      timeEntry: { select: { id: true, locationId: true } },
    },
  })) as
    | {
        id: string;
        endedAt: Date | null;
        timeEntry: { id: string; locationId: string };
      }
    | null;
  if (!row) throw new NotFoundError('Break not found');
  if (row.endedAt) throw new ConflictError('Break is already ended');
  const updated = (await ctx.prisma.break.update({
    ...query,
    where: { id: row.id },
    data: { endedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'time_entry.break_ended',
    resourceType: 'break',
    resourceId: updated.id,
    metadata: { timeEntryId: row.timeEntry.id },
  });
  await pubsub.publish(scheduleChannelName(row.timeEntry.locationId), {
    kind: 'TimeEntryChanged',
    timeEntryId: row.timeEntry.id,
    userId,
  });
  return updated;
}

builder.mutationField('endBreak', (t) =>
  t.prismaField({
    type: 'Break',
    authScopes: { staff: true },
    args: { input: t.arg({ type: EndBreakInput, required: true }) },
    validate: { schema: z.object({ input: endBreakSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveEndBreak(query, args.input as EndBreakArgs, ctx) as never,
  }),
);
