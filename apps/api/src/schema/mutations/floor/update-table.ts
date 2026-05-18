import { updateTableSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { slugifyTableLabel } from '../../../floor/slug.js';
import { builder } from '../../builder.js';
import { UpdateTableInput } from './inputs.js';

export interface UpdateTableArgs {
  id: string;
  label?: string | null;
  capacity?: number | null;
  shape?: 'RECT' | 'CIRCLE' | null;
  positionX?: number | null;
  positionY?: number | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  sectionId?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveUpdateTable(
  query: object,
  input: UpdateTableArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can update tables');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  const existing = await ctx.prisma.table.findFirst({
    where: { id: input.id, locationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Table not found');

  if (input.sectionId !== undefined && input.sectionId !== null) {
    const section = await ctx.prisma.section.findFirst({
      where: { id: input.sectionId, locationId },
      select: { id: true },
    });
    if (!section) throw new NotFoundError('Section not found');
  }

  let nextSlug: string | null = null;
  if (input.label) {
    nextSlug = slugifyTableLabel(input.label);
    if (!nextSlug) {
      throw new ConflictError(
        'Label must contain at least one letter or number to derive a URL slug',
      );
    }
    const dup = await ctx.prisma.table.findFirst({
      where: {
        locationId,
        NOT: { id: input.id },
        OR: [{ label: input.label }, { slug: nextSlug }],
      },
      select: { id: true },
    });
    if (dup) throw new ConflictError('A table with that label already exists');
  }

  const data: Record<string, unknown> = {};
  if (input.label !== undefined && input.label !== null) {
    data.label = input.label;
    if (nextSlug) data.slug = nextSlug;
  }
  if (input.capacity !== undefined && input.capacity !== null) data.capacity = input.capacity;
  if (input.shape !== undefined && input.shape !== null) data.shape = input.shape;
  if (input.positionX !== undefined && input.positionX !== null) data.positionX = input.positionX;
  if (input.positionY !== undefined && input.positionY !== null) data.positionY = input.positionY;
  if (input.width !== undefined && input.width !== null) data.width = input.width;
  if (input.height !== undefined && input.height !== null) data.height = input.height;
  if (input.rotation !== undefined && input.rotation !== null) data.rotation = input.rotation;
  if (input.sectionId !== undefined) data.sectionId = input.sectionId;

  const updated = (await ctx.prisma.table.update({
    ...query,
    where: { id: input.id },
    data,
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'table.updated',
    resourceType: 'table',
    resourceId: updated.id,
    metadata: data,
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'TableChanged',
    tableId: updated.id,
  });
  return updated;
}

builder.mutationField('updateTable', (t) =>
  t.prismaField({
    type: 'Table',
    authScopes: { manager: true },
    args: { input: t.arg({ type: UpdateTableInput, required: true }) },
    validate: { schema: z.object({ input: updateTableSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveUpdateTable(query, args.input as UpdateTableArgs, ctx) as never,
  }),
);
