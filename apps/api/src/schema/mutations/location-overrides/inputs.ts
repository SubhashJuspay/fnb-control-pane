import { builder } from '../../builder.js';

export const UpsertLocationItemInput = builder.inputType('UpsertLocationItemInput', {
  fields: (t) => ({
    menuItemId: t.field({ type: 'UUID', required: true }),
    hidden: t.boolean({ required: false }),
    available: t.boolean({ required: false }),
    priceCents: t.int({ required: false }),
    stockOnHand: t.int({ required: false }),
    lowStockThreshold: t.int({ required: false }),
  }),
});

export const UpsertLocationModifierInput = builder.inputType(
  'UpsertLocationModifierInput',
  {
    fields: (t) => ({
      modifierId: t.field({ type: 'UUID', required: true }),
      hidden: t.boolean({ required: false }),
      available: t.boolean({ required: false }),
      priceDeltaOverrideCents: t.int({ required: false }),
    }),
  },
);

export const SetItem86Input = builder.inputType('SetItem86Input', {
  fields: (t) => ({
    menuItemId: t.field({ type: 'UUID', required: true }),
    available: t.boolean({ required: true }),
  }),
});
