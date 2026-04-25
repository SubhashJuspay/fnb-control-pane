import { setTaxRateSchema } from '@repo/validation/catalog';
import { z } from 'zod';
import type { RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { builder } from '../../builder.js';
import { SetTaxRateInput } from './inputs.js';

export interface SetTaxRateArgs {
  taxCategoryId: string;
  locationId: string;
  ratePermille: number;
  effectiveFrom?: Date | null;
}

export async function resolveSetTaxRate(
  query: object,
  input: SetTaxRateArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only OWNER or ADMIN can set tax rates');
  }
  const tenantId = ctx.auth.tenant.id;
  const effectiveFrom = input.effectiveFrom ?? new Date();
  return ctx.prisma.$transaction(async (tx) => {
    const taxCategory = await tx.taxCategory.findFirst({
      where: { id: input.taxCategoryId, tenantId },
      select: { id: true },
    });
    if (!taxCategory) throw new NotFoundError('Tax category not found');
    const location = await tx.location.findFirst({
      where: { id: input.locationId, tenantId },
      select: { id: true },
    });
    if (!location) throw new NotFoundError('Location not found');
    // Close the most-recent open rate, if any.
    const openRate = await tx.taxRate.findFirst({
      where: {
        taxCategoryId: input.taxCategoryId,
        locationId: input.locationId,
        effectiveUntil: null,
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true },
    });
    if (openRate) {
      await tx.taxRate.update({
        where: { id: openRate.id },
        data: { effectiveUntil: effectiveFrom },
      });
    }
    const created = (await tx.taxRate.create({
      ...query,
      data: {
        taxCategoryId: input.taxCategoryId,
        locationId: input.locationId,
        ratePermille: input.ratePermille,
        effectiveFrom,
        effectiveUntil: null,
      },
    })) as { id: string };
    await tx.auditLog.create({
      data: {
        tenantId,
        locationId: input.locationId,
        actorUserId:
          ctx.auth.kind === 'authenticated' ? ctx.auth.user.id : null,
        action: 'catalog.tax_rate.set',
        resourceType: 'tax_rate',
        resourceId: created.id,
        metadata: {
          taxCategoryId: input.taxCategoryId,
          locationId: input.locationId,
          ratePermille: input.ratePermille,
        },
      },
    });
    return created;
  });
}

builder.mutationField('setTaxRate', (t) =>
  t.prismaField({
    type: 'TaxRate',
    authScopes: { admin: true },
    args: { input: t.arg({ type: SetTaxRateInput, required: true }) },
    validate: { schema: z.object({ input: setTaxRateSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveSetTaxRate(query, args.input as SetTaxRateArgs, ctx) as never,
  }),
);

// Note: the audit row is written inside the transaction so the rate row +
// audit log commit atomically. The action code `catalog.tax_rate.set` matches
// the spec.
