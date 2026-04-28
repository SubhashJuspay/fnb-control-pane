import { builder } from '../../builder.js';
import { DayOfWeekEnum, EmploymentTypeEnum } from '../../enums.js';

// ─── Job roles ─────────────────────────────────────────────────
export const CreateJobRoleInput = builder.inputType('CreateJobRoleInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    color: t.string({ required: false }),
  }),
});

export const UpdateJobRoleInput = builder.inputType('UpdateJobRoleInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    color: t.string({ required: false }),
  }),
});

export const ArchiveJobRoleInput = builder.inputType('ArchiveJobRoleInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

// ─── Employment profile ────────────────────────────────────────
export const UpsertEmploymentProfileInput = builder.inputType(
  'UpsertEmploymentProfileInput',
  {
    fields: (t) => ({
      userId: t.field({ type: 'UUID', required: true }),
      locationId: t.field({ type: 'UUID', required: true }),
      employmentType: t.field({ type: EmploymentTypeEnum, required: true }),
      hourlyRateCents: t.int({ required: false }),
      hireDate: t.field({ type: 'DateTime', required: true }),
      terminationDate: t.field({ type: 'DateTime', required: false }),
      notes: t.string({ required: false }),
    }),
  },
);

export const EndEmploymentInput = builder.inputType('EndEmploymentInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    terminationDate: t.field({ type: 'DateTime', required: true }),
  }),
});

// ─── Availability ─────────────────────────────────────────────
export const AvailabilityWindowInput = builder.inputType('AvailabilityWindowInput', {
  fields: (t) => ({
    dayOfWeek: t.field({ type: DayOfWeekEnum, required: true }),
    startTime: t.string({ required: true }),
    endTime: t.string({ required: true }),
  }),
});

export const SetAvailabilityInput = builder.inputType('SetAvailabilityInput', {
  fields: (t) => ({
    windows: t.field({ type: [AvailabilityWindowInput], required: true }),
  }),
});

export const SetUserAvailabilityInput = builder.inputType(
  'SetUserAvailabilityInput',
  {
    fields: (t) => ({
      userId: t.field({ type: 'UUID', required: true }),
      windows: t.field({ type: [AvailabilityWindowInput], required: true }),
    }),
  },
);
