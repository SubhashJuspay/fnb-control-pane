import { z } from 'zod';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const onlinePickupKindSchema = z.enum(['ASAP', 'SCHEDULED']);
export type OnlinePickupKind = z.infer<typeof onlinePickupKindSchema>;

export const onlineOrderConfirmStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'REJECTED']);
export type OnlineOrderConfirmStatus = z.infer<typeof onlineOrderConfirmStatusSchema>;

const phoneSchema = z
  .string()
  .trim()
  .min(1)
  .transform((v) => v.replace(/[\s()]/g, ''))
  .pipe(z.string().min(7).max(20));

const submitOnlineOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  modifiers: z.array(z.string().uuid()).max(20).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type SubmitOnlineOrderItemInput = z.infer<typeof submitOnlineOrderItemSchema>;

export const submitOnlineOrderSchema = z
  .object({
    tenantSlug: z.string().regex(slugPattern),
    locationSlug: z.string().regex(slugPattern),
    customerName: z.string().trim().min(1).max(120),
    customerPhone: phoneSchema,
    customerEmail: z.string().trim().email().max(254).optional().nullable(),
    pickupKind: onlinePickupKindSchema,
    pickupAt: z.coerce.date().optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z.array(submitOnlineOrderItemSchema).min(1).max(50),
  })
  .superRefine((val, ctx) => {
    if (val.pickupKind === 'SCHEDULED') {
      if (!val.pickupAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pickupAt'],
          message: 'pickupAt is required when pickupKind is SCHEDULED',
        });
        return;
      }
      const now = Date.now();
      const min = now + 15 * 60_000;
      const max = now + 7 * 24 * 60 * 60_000;
      const pickup = val.pickupAt.getTime();
      if (pickup < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pickupAt'],
          message: 'pickupAt must be at least 15 minutes from now',
        });
      } else if (pickup > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pickupAt'],
          message: 'pickupAt must be at most 7 days from now',
        });
      }
    }
  });
export type SubmitOnlineOrderInput = z.infer<typeof submitOnlineOrderSchema>;

export const confirmOnlineOrderSchema = z.object({
  id: z.string().uuid(),
  estimatedReadyAt: z.coerce.date().optional().nullable(),
});
export type ConfirmOnlineOrderInput = z.infer<typeof confirmOnlineOrderSchema>;

export const rejectOnlineOrderSchema = z.object({
  id: z.string().uuid(),
  rejectReason: z.string().trim().min(1).max(500),
});
export type RejectOnlineOrderInput = z.infer<typeof rejectOnlineOrderSchema>;

export const trackOnlineOrderSchema = z.object({
  token: z.string().min(32),
});
export type TrackOnlineOrderInput = z.infer<typeof trackOnlineOrderSchema>;
