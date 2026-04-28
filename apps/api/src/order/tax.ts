import type { PrismaClient } from '@repo/db';

export interface TaxRateRow {
  id: string;
  ratePermille: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}

export function pickTaxRateAt(args: { rates: TaxRateRow[]; at: Date }): TaxRateRow | null {
  return (
    args.rates.find(
      (r) =>
        r.effectiveFrom.getTime() <= args.at.getTime() &&
        (r.effectiveUntil === null || r.effectiveUntil.getTime() > args.at.getTime()),
    ) ?? null
  );
}

export async function resolveTaxRateAt(args: {
  prisma: PrismaClient;
  taxCategoryId: string;
  locationId: string;
  at: Date;
}): Promise<number> {
  const rates = await args.prisma.taxRate.findMany({
    where: { taxCategoryId: args.taxCategoryId, locationId: args.locationId },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, ratePermille: true, effectiveFrom: true, effectiveUntil: true },
  });
  return pickTaxRateAt({ rates, at: args.at })?.ratePermille ?? 0;
}
