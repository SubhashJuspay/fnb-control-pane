import { builder } from '../../builder.js';
import { ItemCourseEnum, TaxCategoryKindEnum } from '../../enums.js';

export const CreateMenuItemInput = builder.inputType('CreateMenuItemInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    shortDescription: t.string({ required: false }),
    description: t.string({ required: false }),
    basePriceCents: t.int({ required: true }),
    imageUrl: t.string({ required: false }),
    course: t.field({ type: ItemCourseEnum, required: false }),
    printerStation: t.string({ required: false }),
    categoryId: t.field({ type: 'UUID', required: false }),
    taxCategoryId: t.field({ type: 'UUID', required: true }),
    dietaryTags: t.stringList({ required: false }),
    allergenTags: t.stringList({ required: false }),
  }),
});

export const UpdateMenuItemInput = builder.inputType('UpdateMenuItemInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    shortDescription: t.string({ required: false }),
    description: t.string({ required: false }),
    basePriceCents: t.int({ required: false }),
    imageUrl: t.string({ required: false }),
    course: t.field({ type: ItemCourseEnum, required: false }),
    printerStation: t.string({ required: false }),
    categoryId: t.field({ type: 'UUID', required: false }),
    taxCategoryId: t.field({ type: 'UUID', required: false }),
    dietaryTags: t.stringList({ required: false }),
    allergenTags: t.stringList({ required: false }),
  }),
});

export const ArchiveMenuItemInput = builder.inputType('ArchiveMenuItemInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const UnarchiveMenuItemInput = builder.inputType('UnarchiveMenuItemInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const CreateCategoryInput = builder.inputType('CreateCategoryInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    slug: t.string({ required: true }),
    sortOrder: t.int({ required: false }),
  }),
});

export const UpdateCategoryInput = builder.inputType('UpdateCategoryInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    slug: t.string({ required: false }),
  }),
});

export const ReorderCategoriesInput = builder.inputType('ReorderCategoriesInput', {
  fields: (t) => ({
    orderedIds: t.field({ type: ['UUID'], required: true }),
  }),
});

export const ArchiveCategoryInput = builder.inputType('ArchiveCategoryInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const CreateModifierGroupInput = builder.inputType('CreateModifierGroupInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    minSelections: t.int({ required: false }),
    maxSelections: t.int({ required: false }),
  }),
});

export const UpdateModifierGroupInput = builder.inputType('UpdateModifierGroupInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    minSelections: t.int({ required: false }),
    maxSelections: t.int({ required: false }),
  }),
});

export const ArchiveModifierGroupInput = builder.inputType('ArchiveModifierGroupInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const AddModifierInput = builder.inputType('AddModifierInput', {
  fields: (t) => ({
    modifierGroupId: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: true }),
    priceDeltaCents: t.int({ required: false }),
    isDefault: t.boolean({ required: false }),
  }),
});

export const UpdateModifierInput = builder.inputType('UpdateModifierInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    priceDeltaCents: t.int({ required: false }),
    isDefault: t.boolean({ required: false }),
  }),
});

export const ReorderModifiersInput = builder.inputType('ReorderModifiersInput', {
  fields: (t) => ({
    modifierGroupId: t.field({ type: 'UUID', required: true }),
    orderedIds: t.field({ type: ['UUID'], required: true }),
  }),
});

export const ArchiveModifierInput = builder.inputType('ArchiveModifierInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const AttachModifierGroupInput = builder.inputType('AttachModifierGroupInput', {
  fields: (t) => ({
    menuItemId: t.field({ type: 'UUID', required: true }),
    modifierGroupId: t.field({ type: 'UUID', required: true }),
    sortOrder: t.int({ required: false }),
  }),
});

export const DetachModifierGroupInput = builder.inputType('DetachModifierGroupInput', {
  fields: (t) => ({
    menuItemId: t.field({ type: 'UUID', required: true }),
    modifierGroupId: t.field({ type: 'UUID', required: true }),
  }),
});

export const CreateTaxCategoryInput = builder.inputType('CreateTaxCategoryInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    kind: t.field({ type: TaxCategoryKindEnum, required: true }),
  }),
});

export const SetTaxRateInput = builder.inputType('SetTaxRateInput', {
  fields: (t) => ({
    taxCategoryId: t.field({ type: 'UUID', required: true }),
    locationId: t.field({ type: 'UUID', required: true }),
    ratePermille: t.int({ required: true }),
    effectiveFrom: t.field({ type: 'DateTime', required: false }),
  }),
});
