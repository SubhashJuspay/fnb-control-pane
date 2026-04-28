import { z } from 'zod';

export const employmentTypeSchema = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR']);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const dayOfWeekDbSchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
export type DayOfWeekDb = z.infer<typeof dayOfWeekDbSchema>;

export const shiftStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']);
export type ShiftStatus = z.infer<typeof shiftStatusSchema>;

const colorHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #6366f1');

export const createJobRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: colorHexSchema.default('#6366f1'),
});
export type CreateJobRoleInput = z.infer<typeof createJobRoleSchema>;

export const updateJobRoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  color: colorHexSchema.optional(),
});
export type UpdateJobRoleInput = z.infer<typeof updateJobRoleSchema>;

export const archiveJobRoleSchema = z.object({ id: z.string().uuid() });
export type ArchiveJobRoleInput = z.infer<typeof archiveJobRoleSchema>;

export const upsertEmploymentProfileSchema = z.object({
  userId: z.string().uuid(),
  locationId: z.string().uuid(),
  employmentType: employmentTypeSchema,
  hourlyRateCents: z.number().int().min(0).optional().nullable(),
  hireDate: z.coerce.date(),
  terminationDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type UpsertEmploymentProfileInput = z.infer<typeof upsertEmploymentProfileSchema>;

export const endEmploymentSchema = z.object({
  id: z.string().uuid(),
  terminationDate: z.coerce.date(),
});
export type EndEmploymentInput = z.infer<typeof endEmploymentSchema>;

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM in 24-hour format');

export const availabilityWindowSchema = z
  .object({
    dayOfWeek: dayOfWeekDbSchema,
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
  })
  .refine((w) => w.endTime > w.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type AvailabilityWindowInput = z.infer<typeof availabilityWindowSchema>;

export const setAvailabilitySchema = z.object({
  windows: z.array(availabilityWindowSchema),
});
export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;

export const setUserAvailabilitySchema = z.object({
  userId: z.string().uuid(),
  windows: z.array(availabilityWindowSchema),
});
export type SetUserAvailabilityInput = z.infer<typeof setUserAvailabilitySchema>;

const MAX_SHIFT_MS = 16 * 60 * 60 * 1000;

export const createShiftSchema = z
  .object({
    userId: z.string().uuid(),
    jobRoleId: z.string().uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine((s) => s.endsAt.getTime() > s.startsAt.getTime(), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine((s) => s.endsAt.getTime() - s.startsAt.getTime() <= MAX_SHIFT_MS, {
    message: 'Shift duration must not exceed 16 hours',
    path: ['endsAt'],
  });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid().optional(),
    jobRoleId: z.string().uuid().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (s) => {
      if (s.startsAt && s.endsAt) return s.endsAt.getTime() > s.startsAt.getTime();
      return true;
    },
    { message: 'endsAt must be after startsAt', path: ['endsAt'] },
  )
  .refine(
    (s) => {
      if (s.startsAt && s.endsAt) return s.endsAt.getTime() - s.startsAt.getTime() <= MAX_SHIFT_MS;
      return true;
    },
    { message: 'Shift duration must not exceed 16 hours', path: ['endsAt'] },
  );
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const publishShiftSchema = z.object({ id: z.string().uuid() });
export type PublishShiftInput = z.infer<typeof publishShiftSchema>;

export const publishWeekSchema = z.object({
  locationId: z.string().uuid(),
  weekStart: z.coerce.date(),
});
export type PublishWeekInput = z.infer<typeof publishWeekSchema>;

export const cancelShiftSchema = z.object({
  id: z.string().uuid(),
  cancelReason: z.string().trim().max(500).optional().nullable(),
});
export type CancelShiftInput = z.infer<typeof cancelShiftSchema>;

export const duplicateWeekSchema = z.object({
  locationId: z.string().uuid(),
  weekStart: z.coerce.date(),
  targetWeekStart: z.coerce.date(),
});
export type DuplicateWeekInput = z.infer<typeof duplicateWeekSchema>;
