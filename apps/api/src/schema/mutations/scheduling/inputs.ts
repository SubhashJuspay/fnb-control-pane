import { builder } from '../../builder.js';

export const CreateShiftInput = builder.inputType('CreateShiftInput', {
  fields: (t) => ({
    userId: t.field({ type: 'UUID', required: true }),
    jobRoleId: t.field({ type: 'UUID', required: true }),
    startsAt: t.field({ type: 'DateTime', required: true }),
    endsAt: t.field({ type: 'DateTime', required: true }),
    notes: t.string({ required: false }),
  }),
});

export const UpdateShiftInput = builder.inputType('UpdateShiftInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    userId: t.field({ type: 'UUID', required: false }),
    jobRoleId: t.field({ type: 'UUID', required: false }),
    startsAt: t.field({ type: 'DateTime', required: false }),
    endsAt: t.field({ type: 'DateTime', required: false }),
    notes: t.string({ required: false }),
  }),
});

export const PublishShiftInput = builder.inputType('PublishShiftInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const PublishWeekInput = builder.inputType('PublishWeekInput', {
  fields: (t) => ({
    locationId: t.field({ type: 'UUID', required: true }),
    weekStart: t.field({ type: 'DateTime', required: true }),
  }),
});

export const CancelShiftInput = builder.inputType('CancelShiftInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    cancelReason: t.string({ required: false }),
  }),
});

export const DuplicateWeekInput = builder.inputType('DuplicateWeekInput', {
  fields: (t) => ({
    locationId: t.field({ type: 'UUID', required: true }),
    weekStart: t.field({ type: 'DateTime', required: true }),
    targetWeekStart: t.field({ type: 'DateTime', required: true }),
  }),
});
