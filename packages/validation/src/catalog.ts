import { z } from 'zod';
import { slugSchema } from './tenant.js';
import { dietaryTagSchema, allergenTagSchema } from './dietary-tags.js';

export const itemCourseSchema = z.enum(['APPETIZER', 'MAIN', 'DESSERT', 'SIDE', 'BEVERAGE', 'OTHER']);
export const taxCategoryKindSchema = z.enum(['FOOD', 'NON_ALCOHOL_BEV', 'ALCOHOL', 'RETAIL', 'OTHER']);

const priceCents = z.number().int().min(0).max(1_000_000);
const priceDeltaCents = z.number().int().min(-1_000_000).max(1_000_000);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  slug: slugSchema.optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

export const createTaxCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: taxCategoryKindSchema,
});
export type CreateTaxCategoryInput = z.infer<typeof createTaxCategorySchema>;

export const setTaxRateSchema = z.object({
  taxCategoryId: z.string().uuid(),
  locationId: z.string().uuid(),
  ratePermille: z.number().int().min(0).max(10_000), // 1000 permille = 100%
  effectiveFrom: z.coerce.date().optional(),
});
export type SetTaxRateInput = z.infer<typeof setTaxRateSchema>;

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  shortDescription: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  basePriceCents: priceCents,
  imageUrl: z.string().url().max(2000).optional().nullable(),
  course: itemCourseSchema.default('MAIN'),
  printerStation: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  taxCategoryId: z.string().uuid(),
  dietaryTags: z.array(dietaryTagSchema).default([]),
  allergenTags: z.array(allergenTagSchema).default([]),
});
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;

export const updateMenuItemSchema = createMenuItemSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const archiveMenuItemSchema = z.object({ id: z.string().uuid() });
export type ArchiveMenuItemInput = z.infer<typeof archiveMenuItemSchema>;

export const unarchiveMenuItemSchema = z.object({ id: z.string().uuid() });
export type UnarchiveMenuItemInput = z.infer<typeof unarchiveMenuItemSchema>;

export const createModifierGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    minSelections: z.number().int().min(0).default(0),
    maxSelections: z.number().int().min(1).default(1),
  })
  .refine((g) => g.maxSelections >= g.minSelections, {
    message: 'maxSelections must be ≥ minSelections',
    path: ['maxSelections'],
  });
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;

export const updateModifierGroupSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    minSelections: z.number().int().min(0).optional(),
    maxSelections: z.number().int().min(1).optional(),
  })
  .refine(
    (g) =>
      g.minSelections === undefined ||
      g.maxSelections === undefined ||
      g.maxSelections >= g.minSelections,
    { message: 'maxSelections must be ≥ minSelections', path: ['maxSelections'] },
  );
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;

export const archiveModifierGroupSchema = z.object({ id: z.string().uuid() });
export type ArchiveModifierGroupInput = z.infer<typeof archiveModifierGroupSchema>;

export const addModifierSchema = z.object({
  modifierGroupId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  priceDeltaCents: priceDeltaCents.default(0),
  isDefault: z.boolean().default(false),
});
export type AddModifierInput = z.infer<typeof addModifierSchema>;

export const updateModifierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  priceDeltaCents: priceDeltaCents.optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;

export const reorderModifiersSchema = z.object({
  modifierGroupId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderModifiersInput = z.infer<typeof reorderModifiersSchema>;

export const archiveModifierSchema = z.object({ id: z.string().uuid() });
export type ArchiveModifierInput = z.infer<typeof archiveModifierSchema>;

export const attachModifierGroupSchema = z.object({
  menuItemId: z.string().uuid(),
  modifierGroupId: z.string().uuid(),
  sortOrder: z.number().int().min(0).optional(),
});
export type AttachModifierGroupInput = z.infer<typeof attachModifierGroupSchema>;

export const detachModifierGroupSchema = z.object({
  menuItemId: z.string().uuid(),
  modifierGroupId: z.string().uuid(),
});
export type DetachModifierGroupInput = z.infer<typeof detachModifierGroupSchema>;
