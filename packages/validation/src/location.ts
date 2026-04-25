import { z } from 'zod';
import { slugSchema } from './tenant.js';

export const isoCurrencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/);
export const ianaTimezoneSchema = z.string().min(1);
export const businessDayCutoffSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24-hour format');

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  timezone: ianaTimezoneSchema,
  currency: isoCurrencySchema,
  locale: z.string().min(2).max(10).default('en-US'),
  businessDayCutoff: businessDayCutoffSchema.default('04:00'),
  address: z
    .object({
      line1: z.string().trim().max(200).optional(),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().max(100).optional(),
      region: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().length(2).optional(),
    })
    .optional(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
