import { z } from 'zod';

export const dietaryTagSchema = z.enum([
  'VEGETARIAN',
  'VEGAN',
  'GLUTEN_FREE',
  'DAIRY_FREE',
  'NUT_FREE',
  'KOSHER',
  'HALAL',
  'SPICY',
]);
export type DietaryTag = z.infer<typeof dietaryTagSchema>;

export const allergenTagSchema = z.enum([
  'CONTAINS_NUTS',
  'CONTAINS_DAIRY',
  'CONTAINS_GLUTEN',
  'CONTAINS_EGGS',
  'CONTAINS_SOY',
  'CONTAINS_FISH',
  'CONTAINS_SHELLFISH',
  'CONTAINS_SESAME',
]);
export type AllergenTag = z.infer<typeof allergenTagSchema>;
