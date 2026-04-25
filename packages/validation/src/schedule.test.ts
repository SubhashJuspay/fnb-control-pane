import { describe, expect, it } from 'vitest';
import { scheduleSchema } from './schedule.js';

describe('scheduleSchema', () => {
  it('accepts kind: always', () => {
    expect(scheduleSchema.safeParse({ kind: 'always' }).success).toBe(true);
  });

  it('accepts a valid weekly window', () => {
    const result = scheduleSchema.safeParse({
      kind: 'weekly',
      windows: [{ days: ['MON', 'TUE'], start: '06:00', end: '11:00' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty windows array', () => {
    const result = scheduleSchema.safeParse({ kind: 'weekly', windows: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid day code', () => {
    const result = scheduleSchema.safeParse({
      kind: 'weekly',
      windows: [{ days: ['XYZ'], start: '06:00', end: '11:00' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed times', () => {
    const result = scheduleSchema.safeParse({
      kind: 'weekly',
      windows: [{ days: ['MON'], start: '6am', end: '11:00' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects start >= end within a window', () => {
    const result = scheduleSchema.safeParse({
      kind: 'weekly',
      windows: [{ days: ['MON'], start: '11:00', end: '06:00' }],
    });
    expect(result.success).toBe(false);
  });
});
