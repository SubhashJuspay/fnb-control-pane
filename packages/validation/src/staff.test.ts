import { describe, expect, it } from 'vitest';
import {
  createJobRoleSchema,
  updateJobRoleSchema,
  archiveJobRoleSchema,
  upsertEmploymentProfileSchema,
  endEmploymentSchema,
  setAvailabilitySchema,
  setUserAvailabilitySchema,
  createShiftSchema,
  updateShiftSchema,
  publishShiftSchema,
  publishWeekSchema,
  cancelShiftSchema,
  duplicateWeekSchema,
} from './staff.js';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('createJobRoleSchema', () => {
  it('accepts a valid role', () => {
    expect(createJobRoleSchema.safeParse({ name: 'Server', color: '#ff0000' }).success).toBe(true);
  });
  it('rejects empty name', () => {
    expect(createJobRoleSchema.safeParse({ name: '', color: '#ff0000' }).success).toBe(false);
  });
  it('rejects name > 80 chars', () => {
    expect(createJobRoleSchema.safeParse({ name: 'x'.repeat(81), color: '#ff0000' }).success).toBe(false);
  });
  it('rejects invalid color hex', () => {
    expect(createJobRoleSchema.safeParse({ name: 'Server', color: 'not-a-color' }).success).toBe(false);
  });
  it('accepts default color when omitted', () => {
    expect(createJobRoleSchema.safeParse({ name: 'Server' }).success).toBe(true);
  });
});

describe('updateJobRoleSchema', () => {
  it('accepts partial update with id', () => {
    expect(updateJobRoleSchema.safeParse({ id: UUID, name: 'Bartender' }).success).toBe(true);
  });
  it('rejects missing id', () => {
    expect(updateJobRoleSchema.safeParse({ name: 'Bartender' }).success).toBe(false);
  });
});

describe('archiveJobRoleSchema', () => {
  it('requires uuid id', () => {
    expect(archiveJobRoleSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(archiveJobRoleSchema.safeParse({ id: 'nope' }).success).toBe(false);
  });
});

describe('upsertEmploymentProfileSchema', () => {
  it('accepts a minimal valid input', () => {
    expect(upsertEmploymentProfileSchema.safeParse({
      userId: UUID,
      locationId: UUID,
      employmentType: 'FULL_TIME',
      hireDate: new Date('2026-01-01'),
    }).success).toBe(true);
  });
  it('rejects negative hourlyRateCents', () => {
    expect(upsertEmploymentProfileSchema.safeParse({
      userId: UUID,
      locationId: UUID,
      employmentType: 'PART_TIME',
      hourlyRateCents: -1,
      hireDate: new Date('2026-01-01'),
    }).success).toBe(false);
  });
  it('accepts CONTRACTOR with optional terminationDate', () => {
    expect(upsertEmploymentProfileSchema.safeParse({
      userId: UUID,
      locationId: UUID,
      employmentType: 'CONTRACTOR',
      hireDate: new Date('2026-01-01'),
      terminationDate: new Date('2026-06-01'),
    }).success).toBe(true);
  });
  it('rejects invalid employmentType', () => {
    expect(upsertEmploymentProfileSchema.safeParse({
      userId: UUID,
      locationId: UUID,
      employmentType: 'BOGUS',
      hireDate: new Date('2026-01-01'),
    }).success).toBe(false);
  });
});

describe('endEmploymentSchema', () => {
  it('requires id and terminationDate', () => {
    expect(endEmploymentSchema.safeParse({ id: UUID, terminationDate: new Date('2026-06-01') }).success).toBe(true);
    expect(endEmploymentSchema.safeParse({ id: UUID }).success).toBe(false);
  });
});

describe('setAvailabilitySchema', () => {
  it('accepts windows with end > start', () => {
    expect(setAvailabilitySchema.safeParse({
      windows: [{ dayOfWeek: 'MON', startTime: '08:00', endTime: '17:00' }],
    }).success).toBe(true);
  });
  it('rejects end <= start in a window', () => {
    expect(setAvailabilitySchema.safeParse({
      windows: [{ dayOfWeek: 'MON', startTime: '17:00', endTime: '08:00' }],
    }).success).toBe(false);
    expect(setAvailabilitySchema.safeParse({
      windows: [{ dayOfWeek: 'MON', startTime: '08:00', endTime: '08:00' }],
    }).success).toBe(false);
  });
  it('rejects malformed time', () => {
    expect(setAvailabilitySchema.safeParse({
      windows: [{ dayOfWeek: 'MON', startTime: '8:00', endTime: '17:00' }],
    }).success).toBe(false);
    expect(setAvailabilitySchema.safeParse({
      windows: [{ dayOfWeek: 'MON', startTime: '08:00', endTime: '25:00' }],
    }).success).toBe(false);
  });
  it('accepts empty windows array', () => {
    expect(setAvailabilitySchema.safeParse({ windows: [] }).success).toBe(true);
  });
  it('rejects invalid day-of-week', () => {
    expect(setAvailabilitySchema.safeParse({
      windows: [{ dayOfWeek: 'FUN', startTime: '08:00', endTime: '17:00' }],
    }).success).toBe(false);
  });
});

describe('setUserAvailabilitySchema', () => {
  it('requires userId', () => {
    expect(setUserAvailabilitySchema.safeParse({
      userId: UUID,
      windows: [{ dayOfWeek: 'MON', startTime: '08:00', endTime: '17:00' }],
    }).success).toBe(true);
    expect(setUserAvailabilitySchema.safeParse({
      windows: [{ dayOfWeek: 'MON', startTime: '08:00', endTime: '17:00' }],
    }).success).toBe(false);
  });
});

describe('createShiftSchema', () => {
  it('accepts a valid 8-hour shift', () => {
    expect(createShiftSchema.safeParse({
      userId: UUID,
      jobRoleId: UUID,
      startsAt: new Date('2026-05-01T09:00:00Z'),
      endsAt: new Date('2026-05-01T17:00:00Z'),
    }).success).toBe(true);
  });
  it('rejects endsAt <= startsAt', () => {
    expect(createShiftSchema.safeParse({
      userId: UUID,
      jobRoleId: UUID,
      startsAt: new Date('2026-05-01T17:00:00Z'),
      endsAt: new Date('2026-05-01T09:00:00Z'),
    }).success).toBe(false);
    expect(createShiftSchema.safeParse({
      userId: UUID,
      jobRoleId: UUID,
      startsAt: new Date('2026-05-01T09:00:00Z'),
      endsAt: new Date('2026-05-01T09:00:00Z'),
    }).success).toBe(false);
  });
  it('rejects shifts longer than 16 hours', () => {
    expect(createShiftSchema.safeParse({
      userId: UUID,
      jobRoleId: UUID,
      startsAt: new Date('2026-05-01T00:00:00Z'),
      endsAt: new Date('2026-05-01T17:00:00Z'),
    }).success).toBe(false);
  });
  it('accepts a 16h shift exactly', () => {
    expect(createShiftSchema.safeParse({
      userId: UUID,
      jobRoleId: UUID,
      startsAt: new Date('2026-05-01T00:00:00Z'),
      endsAt: new Date('2026-05-01T16:00:00Z'),
    }).success).toBe(true);
  });
});

describe('updateShiftSchema', () => {
  it('accepts partial update with id', () => {
    expect(updateShiftSchema.safeParse({
      id: UUID,
      notes: 'updated notes',
    }).success).toBe(true);
  });
  it('still enforces endsAt > startsAt when both provided', () => {
    expect(updateShiftSchema.safeParse({
      id: UUID,
      startsAt: new Date('2026-05-01T17:00:00Z'),
      endsAt: new Date('2026-05-01T09:00:00Z'),
    }).success).toBe(false);
  });
  it('rejects missing id', () => {
    expect(updateShiftSchema.safeParse({ notes: 'x' }).success).toBe(false);
  });
});

describe('publishShiftSchema', () => {
  it('requires uuid id', () => {
    expect(publishShiftSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(publishShiftSchema.safeParse({}).success).toBe(false);
  });
});

describe('publishWeekSchema', () => {
  it('requires locationId and weekStart', () => {
    expect(publishWeekSchema.safeParse({ locationId: UUID, weekStart: new Date('2026-05-04') }).success).toBe(true);
    expect(publishWeekSchema.safeParse({ locationId: UUID }).success).toBe(false);
  });
});

describe('cancelShiftSchema', () => {
  it('requires id and accepts optional cancelReason', () => {
    expect(cancelShiftSchema.safeParse({ id: UUID, cancelReason: 'sick' }).success).toBe(true);
    expect(cancelShiftSchema.safeParse({ id: UUID }).success).toBe(true);
  });
  it('rejects > 500-char cancelReason', () => {
    expect(cancelShiftSchema.safeParse({ id: UUID, cancelReason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('duplicateWeekSchema', () => {
  it('accepts valid input', () => {
    expect(duplicateWeekSchema.safeParse({
      locationId: UUID,
      weekStart: new Date('2026-05-04'),
      targetWeekStart: new Date('2026-05-11'),
    }).success).toBe(true);
  });
  it('rejects missing targetWeekStart', () => {
    expect(duplicateWeekSchema.safeParse({
      locationId: UUID,
      weekStart: new Date('2026-05-04'),
    }).success).toBe(false);
  });
});
