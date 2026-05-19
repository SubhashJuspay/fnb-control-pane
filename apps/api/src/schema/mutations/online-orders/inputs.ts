import { builder } from '../../builder.js';
import { OnlinePickupKindEnum, OnlineOrderPaymentModeEnum } from '../../enums.js';

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
    /** PAY_AT_KIOSK requires a connected POS terminal to capture payment. */
    paymentMode: t.field({ type: OnlineOrderPaymentModeEnum, required: false }),
    /**
     * QR-at-table "open tab": when the client already has a tracking
     * token in localStorage for this table, it passes it back here so
     * the server appends items to the existing ticket instead of trying
     * to create a duplicate OnlineOrderRequest (the ticketId column is
     * @unique). Ignored on the pickup flow.
     */
    existingTrackingToken: t.string({ required: false }),
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
