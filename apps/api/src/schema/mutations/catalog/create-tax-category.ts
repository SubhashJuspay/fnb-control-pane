import { createTaxCategorySchema } from '@repo/validation/catalog';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { CreateTaxCategoryInput } from './inputs.js';

export interface CreateTaxCategoryArgs {
  name: string;
  kind: string;
}

export async function resolveCreateTaxCategory(
  query: object,
  input: CreateTaxCategoryArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can create tax categories');
  }
  const tenantId = ctx.auth.tenant.id;
  // Pre-flight check for duplicate (tenantId, kind).
  const existing = await ctx.prisma.taxCategory.findFirst({
    where: { tenantId, kind: input.kind as never },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(`A tax category with kind ${input.kind} already exists`);
  }
  let created: { id: string };
  try {
    created = (await ctx.prisma.taxCategory.create({
      ...query,
      data: {
        tenantId,
        name: input.name,
        kind: input.kind as never,
      },
    })) as { id: string };
  } catch (err) {
    // Catch unique violation race-condition fallback.
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new ConflictError(`A tax category with kind ${input.kind} already exists`);
    }
    throw err;
  }
  await writeAudit(ctx, {
    action: 'catalog.tax_category.created',
    resourceType: 'tax_category',
    resourceId: created.id,
    metadata: { kind: input.kind },
  });
  return created;
}

builder.mutationField('createTaxCategory', (t) =>
  t.prismaField({
    type: 'TaxCategory',
    authScopes: { admin: true },
    args: { input: t.arg({ type: CreateTaxCategoryInput, required: true }) },
    validate: { schema: z.object({ input: createTaxCategorySchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCreateTaxCategory(query, args.input as CreateTaxCategoryArgs, ctx) as never,
  }),
);
