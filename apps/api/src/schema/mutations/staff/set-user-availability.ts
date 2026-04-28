import { setUserAvailabilitySchema } from '@repo/validation/staff';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { AvailabilityWindowRef } from '../../availability.js';
import { SetUserAvailabilityInput } from './inputs.js';
import {
  replaceAvailability,
  type AvailabilityWindowArg,
} from './set-my-availability.js';

export interface SetUserAvailabilityArgs {
  userId: string;
  windows: AvailabilityWindowArg[];
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveSetUserAvailability(
  input: SetUserAvailabilityArgs,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can set availability for others');
  }
  // Verify target user is a member of the viewer's tenant.
  const membership = await ctx.prisma.membership.findFirst({
    where: { userId: input.userId, tenantId: ctx.auth.tenant.id },
    select: { id: true },
  });
  if (!membership) throw new NotFoundError('User not found in tenant');
  const result = await replaceAvailability(ctx, input.userId, input.windows);
  await writeAudit(ctx, {
    action: 'availability.set',
    resourceType: 'availability_window',
    metadata: { userId: input.userId, windowCount: input.windows.length },
  });
  return result;
}

builder.mutationField('setUserAvailability', (t) =>
  t.field({
    type: [AvailabilityWindowRef],
    authScopes: { manager: true },
    args: { input: t.arg({ type: SetUserAvailabilityInput, required: true }) },
    validate: { schema: z.object({ input: setUserAvailabilitySchema }) },
    resolve: (_root, args, ctx) =>
      resolveSetUserAvailability(
        args.input as SetUserAvailabilityArgs,
        ctx,
      ) as never,
  }),
);
