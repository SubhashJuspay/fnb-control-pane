import { punchInSchema } from '@repo/validation/time-clock';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { pubsub, scheduleChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { PunchInInput } from './inputs.js';

export interface PunchInArgs {
  locationId: string;
  shiftId?: string | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

const SHIFT_BIND_WINDOW_MS = 60 * 60 * 1000;

/**
 * Pure: pick a PUBLISHED shift to bind a punch to. Returns the shift whose
 * `startsAt` is within ±60 minutes of `now` and is closest to `now`, or null.
 */
export function pickShiftToBind<T extends { id: string; startsAt: Date }>(
  candidates: T[],
  now: Date,
): T | null {
  let best: { row: T; delta: number } | null = null;
  for (const c of candidates) {
    const delta = Math.abs(c.startsAt.getTime() - now.getTime());
    if (delta <= SHIFT_BIND_WINDOW_MS) {
      if (!best || delta < best.delta) best = { row: c, delta };
    }
  }
  return best?.row ?? null;
}

export async function resolvePunchIn(
  query: object,
  input: PunchInArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only staff or above can punch in');
  }
  // Verify location belongs to viewer tenant.
  const location = await ctx.prisma.location.findFirst({
    where: { id: input.locationId, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!location) throw new NotFoundError('Location not found');

  const userId = ctx.auth.user.id;

  // Reject if there is already an active TimeEntry.
  const active = await ctx.prisma.timeEntry.findFirst({
    where: { userId, clockedOutAt: null },
    select: { id: true },
  });
  if (active) {
    throw new ConflictError('You already have an active punch — punch out first');
  }

  const now = new Date();
  let boundShiftId: string | null = null;
  if (input.shiftId) {
    const explicit = (await ctx.prisma.shift.findFirst({
      where: {
        id: input.shiftId,
        userId,
        locationId: location.id,
      },
      select: { id: true },
    })) as { id: string } | null;
    if (!explicit) throw new NotFoundError('Shift not found for this user');
    boundShiftId = explicit.id;
  } else {
    // Auto-bind to a PUBLISHED shift starting within ±60min of now.
    const candidates = (await ctx.prisma.shift.findMany({
      where: {
        userId,
        locationId: location.id,
        status: 'PUBLISHED',
        startsAt: {
          gte: new Date(now.getTime() - SHIFT_BIND_WINDOW_MS),
          lte: new Date(now.getTime() + SHIFT_BIND_WINDOW_MS),
        },
      },
      select: { id: true, startsAt: true },
    })) as Array<{ id: string; startsAt: Date }>;
    boundShiftId = pickShiftToBind(candidates, now)?.id ?? null;
  }

  const created = (await ctx.prisma.timeEntry.create({
    ...query,
    data: {
      locationId: location.id,
      userId,
      shiftId: boundShiftId,
      clockedInAt: now,
    },
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'time_entry.punched_in',
    resourceType: 'time_entry',
    resourceId: created.id,
    metadata: { locationId: location.id, shiftId: boundShiftId },
  });
  await pubsub.publish(scheduleChannelName(location.id), {
    kind: 'TimeEntryChanged',
    timeEntryId: created.id,
    userId,
  });
  return created;
}

builder.mutationField('punchIn', (t) =>
  t.prismaField({
    type: 'TimeEntry',
    authScopes: { staff: true },
    args: { input: t.arg({ type: PunchInInput, required: true }) },
    validate: { schema: z.object({ input: punchInSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolvePunchIn(query, args.input as PunchInArgs, ctx) as never,
  }),
);
