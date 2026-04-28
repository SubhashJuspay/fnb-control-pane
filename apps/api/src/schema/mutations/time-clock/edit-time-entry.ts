import { editTimeEntrySchema } from '@repo/validation/time-clock';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { EditTimeEntryInput } from './inputs.js';

export interface EditTimeEntryArgs {
  id: string;
  clockedInAt: Date;
  clockedOutAt?: Date | null;
  totalBreakMinutes?: number | null;
  manualEditReason: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveEditTimeEntry(
  query: object,
  input: EditTimeEntryArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can edit time entries');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = (await ctx.prisma.timeEntry.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, userId: true },
  })) as { id: string; userId: string } | null;
  if (!existing) throw new NotFoundError('Time entry not found');

  const updated = (await ctx.prisma.timeEntry.update({
    ...query,
    where: { id: existing.id },
    data: {
      clockedInAt: input.clockedInAt,
      clockedOutAt: input.clockedOutAt ?? null,
      ...(input.totalBreakMinutes !== undefined && input.totalBreakMinutes !== null
        ? { totalBreakMinutes: input.totalBreakMinutes }
        : {}),
      manualEdit: true,
      manualEditReason: input.manualEditReason,
      manualEditById: ctx.auth.user.id,
    },
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'time_entry.manually_edited',
    resourceType: 'time_entry',
    resourceId: updated.id,
    metadata: {
      reason: input.manualEditReason,
      clockedInAt: input.clockedInAt,
      clockedOutAt: input.clockedOutAt ?? null,
      totalBreakMinutes: input.totalBreakMinutes ?? null,
    },
  });
  await pubsub.publish(scheduleChannelName(locationId), {
    kind: 'TimeEntryChanged',
    timeEntryId: updated.id,
    userId: existing.userId,
  });
  return updated;
}

builder.mutationField('editTimeEntry', (t) =>
  t.prismaField({
    type: 'TimeEntry',
    authScopes: { manager: true },
    args: { input: t.arg({ type: EditTimeEntryInput, required: true }) },
    validate: { schema: z.object({ input: editTimeEntrySchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveEditTimeEntry(query, args.input as EditTimeEntryArgs, ctx) as never,
  }),
);
