import { describe, expect, it } from 'vitest';
import {
  punchInSchema,
  punchOutSchema,
  startBreakSchema,
  endBreakSchema,
  editTimeEntrySchema,
} from './time-clock.js';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('punchInSchema', () => {
  it('accepts locationId only', () => {
    expect(punchInSchema.safeParse({ locationId: UUID }).success).toBe(true);
  });
  it('accepts locationId + shiftId', () => {
    expect(punchInSchema.safeParse({ locationId: UUID, shiftId: UUID }).success).toBe(true);
  });
  it('rejects missing locationId', () => {
    expect(punchInSchema.safeParse({}).success).toBe(false);
  });
  it('rejects non-uuid shiftId', () => {
    expect(punchInSchema.safeParse({ locationId: UUID, shiftId: 'nope' }).success).toBe(false);
  });
});

describe('punchOutSchema', () => {
  it('requires uuid timeEntryId', () => {
    expect(punchOutSchema.safeParse({ timeEntryId: UUID }).success).toBe(true);
    expect(punchOutSchema.safeParse({ timeEntryId: 'nope' }).success).toBe(false);
  });
});

describe('startBreakSchema', () => {
  it('requires uuid timeEntryId', () => {
    expect(startBreakSchema.safeParse({ timeEntryId: UUID }).success).toBe(true);
    expect(startBreakSchema.safeParse({}).success).toBe(false);
  });
});

describe('endBreakSchema', () => {
  it('requires uuid breakId', () => {
    expect(endBreakSchema.safeParse({ breakId: UUID }).success).toBe(true);
    expect(endBreakSchema.safeParse({}).success).toBe(false);
  });
});

describe('editTimeEntrySchema', () => {
  it('accepts a valid manual edit', () => {
    expect(editTimeEntrySchema.safeParse({
      id: UUID,
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      clockedOutAt: new Date('2026-05-01T17:00:00Z'),
      totalBreakMinutes: 30,
      manualEditReason: 'Forgot to punch in',
    }).success).toBe(true);
  });
  it('rejects missing manualEditReason', () => {
    expect(editTimeEntrySchema.safeParse({
      id: UUID,
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
    }).success).toBe(false);
  });
  it('rejects manualEditReason shorter than 2 chars', () => {
    expect(editTimeEntrySchema.safeParse({
      id: UUID,
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      manualEditReason: 'x',
    }).success).toBe(false);
  });
  it('rejects manualEditReason longer than 500 chars', () => {
    expect(editTimeEntrySchema.safeParse({
      id: UUID,
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      manualEditReason: 'x'.repeat(501),
    }).success).toBe(false);
  });
  it('accepts entry without clockedOutAt (still on the clock)', () => {
    expect(editTimeEntrySchema.safeParse({
      id: UUID,
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      manualEditReason: 'Adjusted clock-in',
    }).success).toBe(true);
  });
  it('rejects negative totalBreakMinutes', () => {
    expect(editTimeEntrySchema.safeParse({
      id: UUID,
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      totalBreakMinutes: -5,
      manualEditReason: 'fix',
    }).success).toBe(false);
  });
});
