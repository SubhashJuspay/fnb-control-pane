import { builder } from '../../builder.js';

export const CreateReservationInput = builder.inputType('CreateReservationInput', {
  fields: (t) => ({
    guestName: t.string({ required: true }),
    guestPhone: t.string({ required: false }),
    partySize: t.int({ required: true }),
    requestedTime: t.field({ type: 'DateTime', required: true }),
    durationMinutes: t.int({ required: false }),
    tableId: t.field({ type: 'UUID', required: false }),
    guestId: t.field({ type: 'UUID', required: false }),
    notes: t.string({ required: false }),
  }),
});

export const UpdateReservationInput = builder.inputType('UpdateReservationInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    guestName: t.string({ required: false }),
    guestPhone: t.string({ required: false }),
    partySize: t.int({ required: false }),
    requestedTime: t.field({ type: 'DateTime', required: false }),
    durationMinutes: t.int({ required: false }),
    tableId: t.field({ type: 'UUID', required: false }),
    notes: t.string({ required: false }),
  }),
});

export const ConfirmReservationInput = builder.inputType('ConfirmReservationInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const CancelReservationInput = builder.inputType('CancelReservationInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    cancelReason: t.string({ required: false }),
  }),
});

export const MarkNoShowInput = builder.inputType('MarkNoShowInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const AddWalkinInput = builder.inputType('AddWalkinInput', {
  fields: (t) => ({
    guestName: t.string({ required: true }),
    guestPhone: t.string({ required: false }),
    partySize: t.int({ required: true }),
    notes: t.string({ required: false }),
  }),
});

export const SeatReservationInput = builder.inputType('SeatReservationInput', {
  fields: (t) => ({
    reservationId: t.field({ type: 'UUID', required: true }),
    tableId: t.field({ type: 'UUID', required: false }),
  }),
});

export const CompleteReservationInput = builder.inputType('CompleteReservationInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const SubmitReservationRequestInput = builder.inputType(
  'SubmitReservationRequestInput',
  {
    fields: (t) => ({
      tenantSlug: t.string({ required: true }),
      locationSlug: t.string({ required: true }),
      guestName: t.string({ required: true }),
      guestPhone: t.string({ required: true }),
      guestEmail: t.string({ required: false }),
      partySize: t.int({ required: true }),
      requestedTime: t.field({ type: 'DateTime', required: true }),
      notes: t.string({ required: false }),
    }),
  },
);
