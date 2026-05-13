import { builder } from '../../builder.js';
import { DiscountKindEnum, OrderTypeEnum } from '../../enums.js';

// ─── Ticket lifecycle ──────────────────────────────────────────
export const OpenTicketInput = builder.inputType('OpenTicketInput', {
  fields: (t) => ({
    customerLabel: t.string({ required: false }),
    orderType: t.field({ type: OrderTypeEnum, required: false }),
  }),
});

export const UpdateTicketLabelInput = builder.inputType('UpdateTicketLabelInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    customerLabel: t.string({ required: false }),
  }),
});

export const UpdateTicketOrderTypeInput = builder.inputType('UpdateTicketOrderTypeInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    orderType: t.field({ type: OrderTypeEnum, required: true }),
  }),
});

export const CloseTicketInput = builder.inputType('CloseTicketInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    closeNote: t.string({ required: false }),
    tipCents: t.int({ required: false }),
  }),
});

export const ReopenTicketInput = builder.inputType('ReopenTicketInput', {
  fields: (t) => ({ ticketId: t.field({ type: 'UUID', required: true }) }),
});

export const RefundTicketInput = builder.inputType('RefundTicketInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    amountCents: t.int({ required: true }),
    reason: t.string({ required: true }),
  }),
});

export const VoidTicketInput = builder.inputType('VoidTicketInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    voidReason: t.string({ required: true }),
  }),
});

// ─── Line management ───────────────────────────────────────────
export const AddTicketItemModifierInput = builder.inputType('AddTicketItemModifierInput', {
  fields: (t) => ({ modifierId: t.field({ type: 'UUID', required: true }) }),
});

export const AddTicketItemInput = builder.inputType('AddTicketItemInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    menuItemId: t.field({ type: 'UUID', required: true }),
    quantity: t.int({ required: false }),
    modifiers: t.field({ type: [AddTicketItemModifierInput], required: false }),
    notes: t.string({ required: false }),
  }),
});

export const UpdateTicketItemInput = builder.inputType('UpdateTicketItemInput', {
  fields: (t) => ({
    ticketItemId: t.field({ type: 'UUID', required: true }),
    quantity: t.int({ required: false }),
    notes: t.string({ required: false }),
  }),
});

export const VoidTicketItemInput = builder.inputType('VoidTicketItemInput', {
  fields: (t) => ({
    ticketItemId: t.field({ type: 'UUID', required: true }),
    voidReason: t.string({ required: true }),
  }),
});

export const SetTicketItemModifiersInput = builder.inputType('SetTicketItemModifiersInput', {
  fields: (t) => ({
    ticketItemId: t.field({ type: 'UUID', required: true }),
    modifierIds: t.field({ type: ['UUID'], required: true }),
  }),
});

// ─── Fire / progress ───────────────────────────────────────────
export const FireTicketInput = builder.inputType('FireTicketInput', {
  fields: (t) => ({ ticketId: t.field({ type: 'UUID', required: true }) }),
});

export const FireTicketItemInput = builder.inputType('FireTicketItemInput', {
  fields: (t) => ({ ticketItemId: t.field({ type: 'UUID', required: true }) }),
});

export const MarkTicketItemReadyInput = builder.inputType('MarkTicketItemReadyInput', {
  fields: (t) => ({ ticketItemId: t.field({ type: 'UUID', required: true }) }),
});

export const MarkTicketItemServedInput = builder.inputType('MarkTicketItemServedInput', {
  fields: (t) => ({ ticketItemId: t.field({ type: 'UUID', required: true }) }),
});

// ─── Discounts ────────────────────────────────────────────────
export const ApplyTicketDiscountInput = builder.inputType('ApplyTicketDiscountInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    kind: t.field({ type: DiscountKindEnum, required: true }),
    amountCents: t.int({ required: false }),
    percentBp: t.int({ required: false }),
    reason: t.string({ required: true }),
  }),
});

export const ApplyLineDiscountInput = builder.inputType('ApplyLineDiscountInput', {
  fields: (t) => ({
    ticketItemId: t.field({ type: 'UUID', required: true }),
    kind: t.field({ type: DiscountKindEnum, required: true }),
    amountCents: t.int({ required: false }),
    percentBp: t.int({ required: false }),
    reason: t.string({ required: true }),
  }),
});

export const VoidDiscountInput = builder.inputType('VoidDiscountInput', {
  fields: (t) => ({
    discountId: t.field({ type: 'UUID', required: true }),
    voidReason: t.string({ required: true }),
  }),
});
