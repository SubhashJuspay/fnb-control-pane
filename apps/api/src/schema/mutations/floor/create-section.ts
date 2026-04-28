import { createSectionSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { CreateSectionInput } from './inputs.js';

export interface CreateSectionArgs {
  name: string;
  sortOrder?: number | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveCreateSection(
  query: object,
  input: CreateSectionArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can create sections');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.section.findFirst({
    where: { locationId, name: input.name },
    select: { id: true },
  });
  if (existing) throw new ConflictError('A section with that name already exists');
  const created = (await ctx.prisma.section.create({
    ...query,
    data: {
      locationId,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'section.created',
    resourceType: 'section',
    resourceId: created.id,
    metadata: { name: input.name },
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'SectionChanged',
    sectionId: created.id,
  });
  return created;
}

builder.mutationField('createSection', (t) =>
  t.prismaField({
    type: 'Section',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CreateSectionInput, required: true }) },
    validate: { schema: z.object({ input: createSectionSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateSection(query, args.input as CreateSectionArgs, ctx) as never,
  }),
);
