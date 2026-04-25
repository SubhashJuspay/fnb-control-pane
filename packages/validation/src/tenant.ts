import { z } from 'zod';

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase alphanumeric with hyphens');

export const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
