import { z } from 'zod';

export const dayOfWeekSchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24-hour format');

export const scheduleWindowSchema = z
  .object({
    days: z.array(dayOfWeekSchema).min(1, 'Pick at least one day'),
    start: timeOfDay,
    end: timeOfDay,
  })
  .refine((w) => w.start < w.end, {
    message: 'Window end must be after start',
    path: ['end'],
  });
export type ScheduleWindow = z.infer<typeof scheduleWindowSchema>;

export const scheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('always') }),
  z.object({
    kind: z.literal('weekly'),
    windows: z.array(scheduleWindowSchema).min(1, 'At least one window is required'),
  }),
]);
export type Schedule = z.infer<typeof scheduleSchema>;
