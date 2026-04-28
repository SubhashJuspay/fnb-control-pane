import { updateSectionSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { UpdateSectionInput } from './inputs.js';

export interface UpdateSectionArgs {
  id: string;
  name?: string | null;
  sortOrder?: number | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveUpdateSection(
  query: object,
  input: UpdateSectionArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can update sections');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.section.findFirst({
    where: { id: input.id, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Section not found');
  if (input.name) {
    const dup = await ctx.prisma.section.findFirst({
      where: { locationId, name: input.name, NOT: { id: input.id } },
      select: { id: true },
    });
    if (dup) throw new ConflictError('A section with that name already exists');
  }
  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    data.sortOrder = input.sortOrder;
  }
  const updated = (await ctx.prisma.section.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'section.updated',
    resourceType: 'section',
    resourceId: updated.id,
    metadata: data,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'SectionChanged',
    sectionId: updated.id,
  });
  return updated;
}

builder.mutationField('updateSection', (t) =>
  t.prismaField({
    type: 'Section',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateSectionInput, required: true }) },
    validate: { schema: z.object({ input: updateSectionSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateSection(query, args.input as UpdateSectionArgs, ctx) as never,
  }),
);
