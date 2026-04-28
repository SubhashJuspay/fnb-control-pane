import { createGuestSchema } from '@repo/validation/guest';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateGuestInput } from './inputs.js';

export interface CreateGuestArgs {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveCreateGuest(
  query: object,
  input: CreateGuestArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  // staff scope — both managers (from /guests CTA) and staff (from picker)
  // can create new guests.
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only staff or above can create guests');
  }
  const tenantId = ctx.auth.tenant.id;

  const created = (await ctx.prisma.guest.create({
    ...query,
    data: {
      tenantId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
    },
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'guest.created',
    resourceType: 'guest',
    resourceId: created.id,
    metadata: {
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
    },
  });
  return created;
}

builder.mutationField('createGuest', (t) =>
  t.prismaField({
    type: 'Guest',
    authScopes: { staff: true },
    args: { input: t.arg({ type: CreateGuestInput, required: true }) },
    validate: { schema: z.object({ input: createGuestSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateGuest(query, args.input as CreateGuestArgs, ctx) as never,
  }),
);
