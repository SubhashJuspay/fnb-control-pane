import { publishShiftSchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { PublishShiftInput } from './inputs.js';

export interface PublishShiftArgs {
  id: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolvePublishShift(
  query: object,
  input: PublishShiftArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can publish shifts');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = (await ctx.prisma.shift.findFirst({
    where: { id: input.id, locationId },
    select: { id: true, status: true },
  })) as { id: string; status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' } | null;
  if (!existing) throw new NotFoundError('Shift not found');
  if (existing.status !== 'DRAFT') {
    throw new ConflictError('Only DRAFT shifts can be published');
  }
  const updated = (await ctx.prisma.shift.update({
    ...query,
    where: { id: existing.id },
    data: { status: 'PUBLISHED' },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'shift.published',
    resourceType: 'shift',
    resourceId: updated.id,
  });
  await pubsub.publish(scheduleChannelName(locationId), {
    kind: 'ShiftChanged',
    shiftId: updated.id,
  });
  return updated;
}

builder.mutationField('publishShift', (t) =>
  t.prismaField({
    type: 'Shift',
    authScopes: { manager: true },
    args: { input: t.arg({ type: PublishShiftInput, required: true }) },
    validate: { schema: z.object({ input: publishShiftSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolvePublishShift(query, args.input as PublishShiftArgs, ctx) as never,
  }),
);
