import { z } from 'zod';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const onlinePickupKindSchema = z.enum(['ASAP', 'SCHEDULED']);
export type OnlinePickupKind = z.infer<typeof onlinePickupKindSchema>;

export const onlineOrderConfirmStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'REJECTED']);
export type OnlineOrderConfirmStatus = z.infer<typeof onlineOrderConfirmStatusSchema>;

export const onlineOrderPaymentModeSchema = z.enum(['PAY_AT_PICKUP', 'PAY_AT_KIOSK']);
export type OnlineOrderPaymentMode = z.infer<typeof onlineOrderPaymentModeSchema>;

export const onlineOrderPaymentStatusSchema = z.enum(['PENDING', 'CAPTURED', 'DECLINED']);
export type OnlineOrderPaymentStatus = z.infer<typeof onlineOrderPaymentStatusSchema>;

// Mexican phone number validation. Accepts the local 10-digit format with
// an optional +52 country code and an optional mobile "1" carrier prefix.
// Strips whitespace, parens, hyphens, and dots before matching, so customers
// can type whatever they're used to:
//   "55 1234 5678"           → 5512345678
//   "+52 55 1234 5678"       → +525512345678
//   "+52 1 55 1234 5678"     → +5215512345678
//   "(55) 1234-5678"         → 5512345678
const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone is required')
  .transform((v) => v.replace(/[\s()\-.]/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+?52)?1?\d{10}$/,
        'Enter a valid Mexican phone number — 10 digits, optional +52 country code',
      ),
  );

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
    /**
     * QR-at-table dine-in: when set, the order is bound to the table with
     * this slug, marked DINE_IN, and auto-confirmed (skips the staff inbox).
     * When absent, behaves as a regular TAKEOUT pickup order.
     */
    tableSlug: z.string().regex(slugPattern).max(80).optional().nullable(),
    /**
     * PAY_AT_KIOSK switches the order into the kiosk-POS payment flow.
     * Defaults to PAY_AT_PICKUP for backwards compatibility with the
     * existing customer phone order path.
     */
    paymentMode: onlineOrderPaymentModeSchema.optional().nullable(),
    /**
     * Plaintext tracking token from a previous submit at the same
     * QR-at-table tab. Server hashes it to look up the existing
     * OnlineOrderRequest and append items to its ticket. The shape is
     * intentionally loose — the server is the only consumer and it
     * compares against a stored hash.
     */
    existingTrackingToken: z.string().min(1).max(200).optional().nullable(),
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
