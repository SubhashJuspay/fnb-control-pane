import { z } from 'zod';

const MAX_RANGE_DAYS = 92;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const dateRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.to.getTime() >= v.from.getTime(), {
    message: 'to must be on or after from',
    path: ['to'],
  })
  .refine(
    (v) => {
      // Span (inclusive) in days. e.g. from = to → 1 day; max allowed = 92.
      const diffDays = Math.floor((v.to.getTime() - v.from.getTime()) / ONE_DAY_MS) + 1;
      return diffDays <= MAX_RANGE_DAYS;
    },
    {
      message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
      path: ['to'],
    },
  );
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

export const topItemsSortSchema = z.enum(['QUANTITY', 'REVENUE', 'TICKETS']);
export type TopItemsSort = z.infer<typeof topItemsSortSchema>;
