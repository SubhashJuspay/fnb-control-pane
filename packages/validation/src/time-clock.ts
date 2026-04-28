import { z } from 'zod';

export const punchInSchema = z.object({
  locationId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
});
export type PunchInInput = z.infer<typeof punchInSchema>;

export const punchOutSchema = z.object({
  timeEntryId: z.string().uuid(),
});
export type PunchOutInput = z.infer<typeof punchOutSchema>;

export const startBreakSchema = z.object({
  timeEntryId: z.string().uuid(),
});
export type StartBreakInput = z.infer<typeof startBreakSchema>;

export const endBreakSchema = z.object({
  breakId: z.string().uuid(),
});
export type EndBreakInput = z.infer<typeof endBreakSchema>;

export const editTimeEntrySchema = z.object({
  id: z.string().uuid(),
  clockedInAt: z.coerce.date(),
  clockedOutAt: z.coerce.date().optional().nullable(),
  totalBreakMinutes: z.number().int().min(0).optional(),
  manualEditReason: z.string().trim().min(2).max(500),
});
export type EditTimeEntryInput = z.infer<typeof editTimeEntrySchema>;
