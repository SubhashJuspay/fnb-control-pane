import { z } from 'zod';

export const createGuestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type CreateGuestInput = z.infer<typeof createGuestSchema>;

export const updateGuestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(1).max(40).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;

export const archiveGuestSchema = z.object({
  id: z.string().uuid(),
});
export type ArchiveGuestInput = z.infer<typeof archiveGuestSchema>;

export const linkTicketGuestSchema = z.object({
  ticketId: z.string().uuid(),
  guestId: z.string().uuid().nullable(),
});
export type LinkTicketGuestInput = z.infer<typeof linkTicketGuestSchema>;

export const linkReservationGuestSchema = z.object({
  reservationId: z.string().uuid(),
  guestId: z.string().uuid().nullable(),
});
export type LinkReservationGuestInput = z.infer<typeof linkReservationGuestSchema>;

export const searchGuestsSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).default(10),
});
export type SearchGuestsInput = z.infer<typeof searchGuestsSchema>;

export const guestsFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  archivedOnly: z.boolean().default(false),
});
export type GuestsFilterInput = z.infer<typeof guestsFilterSchema>;
