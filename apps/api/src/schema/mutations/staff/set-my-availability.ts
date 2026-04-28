import { setAvailabilitySchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { AvailabilityWindowRef } from '../../availability.js';
import { SetAvailabilityInput } from './inputs.js';

export interface AvailabilityWindowArg {
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  startTime: string;
  endTime: string;
}

export interface SetAvailabilityArgs {
  windows: AvailabilityWindowArg[];
}

/**
 * Replace ALL availability windows for `userId` atomically — delete + insert
 * inside a single transaction. Returns the freshly inserted rows.
 */
export async function replaceAvailability(
  ctx: RequestContext,
  userId: string,
  windows: AvailabilityWindowArg[],
): Promise<unknown[]> {
  return ctx.prisma.$transaction(async (tx) => {
    await tx.availabilityWindow.deleteMany({ where: { userId } });
    if (windows.length === 0) return [];
    await tx.availabilityWindow.createMany({
      data: windows.map((w) => ({
        userId,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
      })),
    });
    return tx.availabilityWindow.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  });
}

export async function resolveSetMyAvailability(
  input: SetAvailabilityArgs,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  const userId = ctx.auth.user.id;
  const result = await replaceAvailability(ctx, userId, input.windows);
  await writeAudit(ctx, {
    action: 'availability.set',
    resourceType: 'availability_window',
    metadata: { userId, windowCount: input.windows.length },
  });
  return result;
}

builder.mutationField('setMyAvailability', (t) =>
  t.field({
    type: [AvailabilityWindowRef],
    authScopes: { authenticated: true },
    args: { input: t.arg({ type: SetAvailabilityInput, required: true }) },
    validate: { schema: z.object({ input: setAvailabilitySchema }) },
    resolve: (_root, args, ctx) =>
      resolveSetMyAvailability(args.input as SetAvailabilityArgs, ctx) as never,
  }),
);
