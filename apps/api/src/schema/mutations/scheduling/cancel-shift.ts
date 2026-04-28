import { cancelShiftSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { CancelShiftInput } from './inputs.js';

export interface CancelShiftArgs {
  id: string;
  cancelReason?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveCancelShift(
  query: object,
  input: CancelShiftArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can cancel shifts');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = (await ctx.prisma.shift.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, status: true },
  })) as { id: string; status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' } | null;
  if (!existing) throw new NotFoundError('Shift not found');
  if (existing.status === 'CANCELLED') {
    throw new ConflictError('Shift is already cancelled');
  }
  const updated = (await ctx.prisma.shift.update({
    ...query,
    where: { id: existing.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: input.cancelReason ?? null,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'shift.cancelled',
    resourceType: 'shift',
    resourceId: updated.id,
    metadata: { cancelReason: input.cancelReason ?? null },
  });
  await pubsub.publish(scheduleChannelName(locationId), {
    kind: 'ShiftChanged',
    shiftId: updated.id,
  });
  return updated;
}

builder.mutationField('cancelShift', (t) =>
  t.prismaField({
    type: 'Shift',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CancelShiftInput, required: true }) },
    validate: { schema: z.object({ input: cancelShiftSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCancelShift(query, args.input as CancelShiftArgs, ctx) as never,
  }),
);
