import { archiveSectionSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { ArchiveSectionInput } from './inputs.js';

export interface ArchiveSectionArgs {
  id: string;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveArchiveSection(
  query: object,
  input: ArchiveSectionArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can archive sections');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const existing = await ctx.prisma.section.findFirst({
    where: { id: input.id, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Section not found');
  const updated = (await ctx.prisma.section.update({
    ...query,
    where: { id: input.id },
    data: { archivedAt: new Date() },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'section.archived',
    resourceType: 'section',
    resourceId: updated.id,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'SectionChanged',
    sectionId: updated.id,
  });
  return updated;
}

builder.mutationField('archiveSection', (t) =>
  t.prismaField({
    type: 'Section',
    authScopes: { manager: true },
    args: { input: t.arg({ type: ArchiveSectionInput, required: true }) },
    validate: { schema: z.object({ input: archiveSectionSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveArchiveSection(query, args.input as ArchiveSectionArgs, ctx) as never,
  }),
);
