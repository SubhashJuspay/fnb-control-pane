import { builder } from '../../builder.js';

export const CreateGuestInput = builder.inputType('CreateGuestInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    phone: t.string({ required: false }),
    email: t.string({ required: false }),
    notes: t.string({ required: false }),
  }),
});

export const UpdateGuestInput = builder.inputType('UpdateGuestInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    phone: t.string({ required: false }),
    email: t.string({ required: false }),
    notes: t.string({ required: false }),
  }),
});

export const ArchiveGuestInput = builder.inputType('ArchiveGuestInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
  }),
});

export const LinkTicketGuestInput = builder.inputType('LinkTicketGuestInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    guestId: t.field({ type: 'UUID', required: false }),
  }),
});

export const LinkReservationGuestInput = builder.inputType('LinkReservationGuestInput', {
  fields: (t) => ({
    reservationId: t.field({ type: 'UUID', required: true }),
    guestId: t.field({ type: 'UUID', required: false }),
  }),
});
