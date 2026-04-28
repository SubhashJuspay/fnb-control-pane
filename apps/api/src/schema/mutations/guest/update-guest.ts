import { updateGuestSchema } from '@repo/validation/guest';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { UpdateGuestInput } from './inputs.js';

export interface UpdateGuestArgs {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveUpdateGuest(
  query: object,
  input: UpdateGuestArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can edit guests');
  }
  const tenantId = ctx.auth.tenant.id;

  const existing = await ctx.prisma.guest.findFirst({
    where: { id: input.id, tenantId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Guest not found');

  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.phone !== undefined) data.phone = input.phone ?? null;
  if (input.email !== undefined) data.email = input.email ?? null;
  if (input.notes !== undefined) data.notes = input.notes ?? null;

  const updated = (await ctx.prisma.guest.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'guest.updated',
    resourceType: 'guest',
    resourceId: updated.id,
    metadata: { fields: Object.keys(data) },
  });
  return updated;
}

builder.mutationField('updateGuest', (t) =>
  t.prismaField({
    type: 'Guest',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateGuestInput, required: true }) },
    validate: { schema: z.object({ input: updateGuestSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateGuest(query, args.input as UpdateGuestArgs, ctx) as never,
  }),
);
