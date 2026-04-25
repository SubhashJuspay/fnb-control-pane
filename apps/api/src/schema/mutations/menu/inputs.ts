import { builder } from '../../builder.js';

export const CreateMenuInput = builder.inputType('CreateMenuInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    description: t.string({ required: false }),
    schedule: t.field({ type: 'JSON', required: false }),
    isActive: t.boolean({ required: false }),
  }),
});

export const UpdateMenuInput = builder.inputType('UpdateMenuInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    description: t.string({ required: false }),
    schedule: t.field({ type: 'JSON', required: false }),
    isActive: t.boolean({ required: false }),
  }),
});

export const ArchiveMenuInput = builder.inputType('ArchiveMenuInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const ReorderMenusInput = builder.inputType('ReorderMenusInput', {
  fields: (t) => ({
    orderedIds: t.field({ type: ['UUID'], required: true }),
  }),
});

export const CreateMenuSectionInput = builder.inputType('CreateMenuSectionInput', {
  fields: (t) => ({
    menuId: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: true }),
  }),
});

export const UpdateMenuSectionInput = builder.inputType('UpdateMenuSectionInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
  }),
});

export const ReorderMenuSectionsInput = builder.inputType('ReorderMenuSectionsInput', {
  fields: (t) => ({
    menuId: t.field({ type: 'UUID', required: true }),
    orderedIds: t.field({ type: ['UUID'], required: true }),
  }),
});

export const ArchiveMenuSectionInput = builder.inputType('ArchiveMenuSectionInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const AddItemToMenuSectionInput = builder.inputType('AddItemToMenuSectionInput', {
  fields: (t) => ({
    menuSectionId: t.field({ type: 'UUID', required: true }),
    menuItemId: t.field({ type: 'UUID', required: true }),
    priceOverrideCents: t.int({ required: false }),
  }),
});

export const UpdateMenuSectionItemInput = builder.inputType('UpdateMenuSectionItemInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    priceOverrideCents: t.int({ required: false }),
  }),
});

export const ReorderMenuSectionItemsInput = builder.inputType('ReorderMenuSectionItemsInput', {
  fields: (t) => ({
    menuSectionId: t.field({ type: 'UUID', required: true }),
    orderedIds: t.field({ type: ['UUID'], required: true }),
  }),
});

export const RemoveItemFromMenuSectionInput = builder.inputType(
  'RemoveItemFromMenuSectionInput',
  {
    fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
  },
);
