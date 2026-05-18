import { createTableSchema } from '@repo/validation/floor';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { floorChannelName, pubsub } from '../../../pubsub.js';
import { slugifyTableLabel } from '../../../floor/slug.js';
import { builder } from '../../builder.js';
import { CreateTableInput } from './inputs.js';

export interface CreateTableArgs {
  label: string;
  capacity?: number | null;
  shape?: 'RECT' | 'CIRCLE' | null;
  positionX: number;
  positionY: number;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  sectionId?: string | null;
}

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

export async function resolveCreateTable(
  query: object,
  input: CreateTableArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can create tables');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;

  if (input.sectionId) {
    const section = await ctx.prisma.section.findFirst({
      where: { id: input.sectionId, locationId },
      select: { id: true },
    });
    if (!section) throw new NotFoundError('Section not found');
  }

  const slug = slugifyTableLabel(input.label);
  if (!slug) {
    throw new ConflictError(
      'Label must contain at least one letter or number to derive a URL slug',
    );
  }
  const dup = await ctx.prisma.table.findFirst({
    where: {
      locationId,
      OR: [{ label: input.label }, { slug }],
    },
    select: { id: true },
  });
  if (dup) throw new ConflictError('A table with that label already exists');

  const created = (await ctx.prisma.table.create({
    ...query,
    data: {
      locationId,
      sectionId: input.sectionId ?? null,
      label: input.label,
      slug,
      capacity: input.capacity ?? 2,
      shape: input.shape ?? 'RECT',
      positionX: input.positionX,
      positionY: input.positionY,
      width: input.width ?? 80,
      height: input.height ?? 80,
      rotation: input.rotation ?? 0,
    },
  })) as { id: string };
  await writeAudit(ctx, {
    action: 'table.created',
    resourceType: 'table',
    resourceId: created.id,
    metadata: { label: input.label, sectionId: input.sectionId ?? null },
  });
  await pubsub.publish(floorChannelName(locationId), {
    kind: 'TableChanged',
    tableId: created.id,
  });
  return created;
}

builder.mutationField('createTable', (t) =>
  t.prismaField({
    type: 'Table',
    authScopes: { manager: true },
    args: { input: t.arg({ type: CreateTableInput, required: true }) },
    validate: { schema: z.object({ input: createTableSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateTable(query, args.input as CreateTableArgs, ctx) as never,
  }),
);
