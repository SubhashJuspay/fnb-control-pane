import { z } from 'zod';
import { scheduleSchema } from './schedule.js';

const priceCents = z.number().int().min(0).max(1_000_000);

export const createMenuSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  schedule: scheduleSchema.default({ kind: 'always' }),
  isActive: z.boolean().default(true),
});
export type CreateMenuInput = z.infer<typeof createMenuSchema>;

export const updateMenuSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  schedule: scheduleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;

export const archiveMenuSchema = z.object({ id: z.string().uuid() });
export type ArchiveMenuInput = z.infer<typeof archiveMenuSchema>;

export const reorderMenusSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderMenusInput = z.infer<typeof reorderMenusSchema>;

export const createMenuSectionSchema = z.object({
  menuId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});
export type CreateMenuSectionInput = z.infer<typeof createMenuSectionSchema>;

export const updateMenuSectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
});
export type UpdateMenuSectionInput = z.infer<typeof updateMenuSectionSchema>;

export const reorderMenuSectionsSchema = z.object({
  menuId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderMenuSectionsInput = z.infer<typeof reorderMenuSectionsSchema>;

export const archiveMenuSectionSchema = z.object({ id: z.string().uuid() });
export type ArchiveMenuSectionInput = z.infer<typeof archiveMenuSectionSchema>;

export const addItemToMenuSectionSchema = z.object({
  menuSectionId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  priceOverrideCents: priceCents.optional().nullable(),
});
export type AddItemToMenuSectionInput = z.infer<typeof addItemToMenuSectionSchema>;

export const updateMenuSectionItemSchema = z.object({
  id: z.string().uuid(),
  priceOverrideCents: priceCents.optional().nullable(),
});
export type UpdateMenuSectionItemInput = z.infer<typeof updateMenuSectionItemSchema>;

export const reorderMenuSectionItemsSchema = z.object({
  menuSectionId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderMenuSectionItemsInput = z.infer<typeof reorderMenuSectionItemsSchema>;

export const removeItemFromMenuSectionSchema = z.object({ id: z.string().uuid() });
export type RemoveItemFromMenuSectionInput = z.infer<typeof removeItemFromMenuSectionSchema>;

export const upsertLocationItemSchema = z.object({
  menuItemId: z.string().uuid(),
  hidden: z.boolean().optional(),
  available: z.boolean().optional(),
  priceCents: priceCents.optional().nullable(),
});
export type UpsertLocationItemInput = z.infer<typeof upsertLocationItemSchema>;

export const upsertLocationModifierSchema = z.object({
  modifierId: z.string().uuid(),
  hidden: z.boolean().optional(),
  available: z.boolean().optional(),
  priceDeltaOverrideCents: z.number().int().min(-1_000_000).max(1_000_000).optional().nullable(),
});
export type UpsertLocationModifierInput = z.infer<typeof upsertLocationModifierSchema>;

export const setItem86Schema = z.object({
  menuItemId: z.string().uuid(),
  available: z.boolean(),
});
export type SetItem86Input = z.infer<typeof setItem86Schema>;
