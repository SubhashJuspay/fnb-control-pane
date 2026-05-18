import { builder } from '../../builder.js';
import { OnlinePickupKindEnum } from '../../enums.js';

export const SubmitOnlineOrderItemInput = builder.inputType(
  'SubmitOnlineOrderItemInput',
  {
    fields: (t) => ({
      menuItemId: t.field({ type: 'UUID', required: true }),
      quantity: t.int({ required: true }),
      modifiers: t.field({ type: ['UUID'], required: false }),
      notes: t.string({ required: false }),
    }),
  },
);

export const SubmitOnlineOrderInput = builder.inputType('SubmitOnlineOrderInput', {
  fields: (t) => ({
    tenantSlug: t.string({ required: true }),
    locationSlug: t.string({ required: true }),
    customerName: t.string({ required: true }),
    customerPhone: t.string({ required: true }),
    customerEmail: t.string({ required: false }),
    pickupKind: t.field({ type: OnlinePickupKindEnum, required: true }),
    pickupAt: t.field({ type: 'DateTime', required: false }),
    notes: t.string({ required: false }),
    items: t.field({
      type: [SubmitOnlineOrderItemInput],
      required: true,
    }),
    /** QR-at-table dine-in flag — see submitOnlineOrderSchema for semantics. */
    tableSlug: t.string({ required: false }),
  }),
});

export const ConfirmOnlineOrderInput = builder.inputType('ConfirmOnlineOrderInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    estimatedReadyAt: t.field({ type: 'DateTime', required: false }),
  }),
});

export const RejectOnlineOrderInput = builder.inputType('RejectOnlineOrderInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    rejectReason: t.string({ required: true }),
  }),
});
