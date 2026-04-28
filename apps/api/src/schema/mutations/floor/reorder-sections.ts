import { reorderSectionsSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ReorderSectionsInput } from './inputs.js';

export interface ReorderSectionsArgs {
  orderedIds: string[];
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveReorderSections(
  input: ReorderSectionsArgs,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can reorder sections');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const rows = await ctx.prisma.section.findMany({
    where: { id: { in: input.orderedIds }, locationId },
    select: { id: true },
  });
  if (rows.length !== input.orderedIds.length) {
    throw new NotFoundError('One or more sections not found');
  }
  await ctx.prisma.$transaction(
    input.orderedIds.map((id, idx) =>
      ctx.prisma.section.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );
  await writeAudit(ctx, {
    action: 'section.reordered',
    resourceType: 'section',
    metadata: { orderedIds: input.orderedIds },
  });
  for (const id of input.orderedIds) {
    await pubsub.publish(floorChannelName(locationId), {
      kind: 'SectionChanged',
      sectionId: id,
    });
  }
  return ctx.prisma.section.findMany({
    where: { id: { in: input.orderedIds } },
    orderBy: { sortOrder: 'asc' },
  });
}

builder.mutationField('reorderSections', (t) =>
  t.prismaField({
    type: ['Section'],
    authScopes: { manager: true },
    args: { input: t.arg({ type: ReorderSectionsInput, required: true }) },
    validate: { schema: z.object({ input: reorderSectionsSchema }) },
    resolve: (_query, _root, args, ctx) =>
      resolveReorderSections(args.input as ReorderSectionsArgs, ctx) as never,
  }),
);
