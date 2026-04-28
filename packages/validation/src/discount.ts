import { z } from 'zod';

export const discountKindSchema = z.enum(['FLAT', 'PERCENT']);
export type DiscountKind = z.infer<typeof discountKindSchema>;

const baseDiscount = z
  .object({
    kind: discountKindSchema,
    amountCents: z.number().int().min(1).max(1_000_000).optional(),
    percentBp: z.number().int().min(1).max(10_000).optional(),
    reason: z.string().trim().min(1).max(200),
  })
  .refine(
    (d) => (d.kind === 'FLAT' ? d.amountCents !== undefined : d.percentBp !== undefined),
    { message: 'FLAT requires amountCents; PERCENT requires percentBp', path: ['kind'] },
  );

export const applyTicketDiscountSchema = baseDiscount.and(z.object({ ticketId: z.string().uuid() }));
export type ApplyTicketDiscountInput = z.infer<typeof applyTicketDiscountSchema>;

export const applyLineDiscountSchema = baseDiscount.and(z.object({ ticketItemId: z.string().uuid() }));
export type ApplyLineDiscountInput = z.infer<typeof applyLineDiscountSchema>;

export const voidDiscountSchema = z.object({
  discountId: z.string().uuid(),
  voidReason: z.string().trim().min(2).max(500),
});
export type VoidDiscountInput = z.infer<typeof voidDiscountSchema>;
