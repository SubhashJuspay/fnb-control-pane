import { archiveGuestSchema } from '@repo/validation/guest';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { ArchiveGuestInput } from './inputs.js';

export interface ArchiveGuestArgs {
  id: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveArchiveGuest(
  query: object,
  input: ArchiveGuestArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can archive guests');
  }
  const tenantId = ctx.auth.tenant.id;

  const existing = await ctx.prisma.guest.findFirst({
    where: { id: input.id, tenantId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Guest not found');

  const updated = (await ctx.prisma.guest.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date(), lastSeenAt: null },
  })) as { id: string };

  await writeAudit(ctx, {
    action: 'guest.archived',
    resourceType: 'guest',
    resourceId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveGuest', (t) =>
  t.prismaField({
    type: 'Guest',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ArchiveGuestInput, required: true }) },
    validate: { schema: z.object({ input: archiveGuestSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveGuest(query, args.input as ArchiveGuestArgs, ctx) as never,
  }),
);
