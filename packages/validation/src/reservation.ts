import { z } from 'zod';

export const reservationKindSchema = z.enum(['RESERVATION', 'WALKIN']);
export type ReservationKind = z.infer<typeof reservationKindSchema>;

export const reservationStatusSchema = z.enum([
  'PENDING', 'CONFIRMED', 'WAITING', 'SEATED', 'COMPLETED', 'NO_SHOW', 'CANCELLED',
]);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const createReservationSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().max(40).optional().nullable(),
  partySize: z.number().int().min(1).max(40),
  requestedTime: z.coerce.date(),
  durationMinutes: z.number().int().min(15).max(720).default(90),
  tableId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const updateReservationSchema = z.object({
  id: z.string().uuid(),
  guestName: z.string().trim().min(1).max(120).optional(),
  guestPhone: z.string().trim().max(40).optional().nullable(),
  partySize: z.number().int().min(1).max(40).optional(),
  requestedTime: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(15).max(720).optional(),
  tableId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  id: z.string().uuid(),
  cancelReason: z.string().trim().max(500).optional().nullable(),
});
export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

export const confirmReservationSchema = z.object({ id: z.string().uuid() });
export type ConfirmReservationInput = z.infer<typeof confirmReservationSchema>;

export const markNoShowSchema = z.object({ id: z.string().uuid() });
export type MarkNoShowInput = z.infer<typeof markNoShowSchema>;

export const addWalkinSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().max(40).optional().nullable(),
  partySize: z.number().int().min(1).max(40),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type AddWalkinInput = z.infer<typeof addWalkinSchema>;

export const seatReservationSchema = z.object({
  reservationId: z.string().uuid(),
  tableId: z.string().uuid().optional(),
});
export type SeatReservationInput = z.infer<typeof seatReservationSchema>;

export const completeReservationSchema = z.object({ id: z.string().uuid() });
export type CompleteReservationInput = z.infer<typeof completeReservationSchema>;
