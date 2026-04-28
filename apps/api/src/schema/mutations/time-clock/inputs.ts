import { builder } from '../../builder.js';

export const PunchInInput = builder.inputType('PunchInInput', {
  fields: (t) => ({
    locationId: t.field({ type: 'UUID', required: true }),
    shiftId: t.field({ type: 'UUID', required: false }),
  }),
});

export const PunchOutInput = builder.inputType('PunchOutInput', {
  fields: (t) => ({
    timeEntryId: t.field({ type: 'UUID', required: true }),
  }),
});

export const StartBreakInput = builder.inputType('StartBreakInput', {
  fields: (t) => ({
    timeEntryId: t.field({ type: 'UUID', required: true }),
  }),
});

export const EndBreakInput = builder.inputType('EndBreakInput', {
  fields: (t) => ({
    breakId: t.field({ type: 'UUID', required: true }),
  }),
});

export const EditTimeEntryInput = builder.inputType('EditTimeEntryInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    clockedInAt: t.field({ type: 'DateTime', required: true }),
    clockedOutAt: t.field({ type: 'DateTime', required: false }),
    totalBreakMinutes: t.int({ required: false }),
    manualEditReason: t.string({ required: true }),
  }),
});
