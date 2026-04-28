import { describe, expect, it } from 'vitest';
import { computePunchedMinutes, validatePunchTransition } from './time-entry.js';

describe('computePunchedMinutes', () => {
  const now = new Date('2026-05-01T20:00:00Z');

  it('computes net minutes when clocked out, no breaks', () => {
    expect(computePunchedMinutes({
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      clockedOutAt: new Date('2026-05-01T17:00:00Z'),
      totalBreakMinutes: 0,
      now,
    })).toBe(8 * 60);
  });

  it('subtracts break minutes from gross', () => {
    expect(computePunchedMinutes({
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      clockedOutAt: new Date('2026-05-01T17:00:00Z'),
      totalBreakMinutes: 30,
      now,
    })).toBe(8 * 60 - 30);
  });

  it('uses now when still clocked in', () => {
    expect(computePunchedMinutes({
      clockedInAt: new Date('2026-05-01T18:00:00Z'),
      clockedOutAt: null,
      totalBreakMinutes: 0,
      now,
    })).toBe(2 * 60);
  });

  it('clamps to 0 when breaks exceed gross', () => {
    expect(computePunchedMinutes({
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      clockedOutAt: new Date('2026-05-01T10:00:00Z'),
      totalBreakMinutes: 999,
      now,
    })).toBe(0);
  });

  it('clamps to 0 when clockedIn is after now (no clockOut)', () => {
    expect(computePunchedMinutes({
      clockedInAt: new Date('2026-05-01T22:00:00Z'),
      clockedOutAt: null,
      totalBreakMinutes: 0,
      now,
    })).toBe(0);
  });

  it('floors fractional minutes', () => {
    expect(computePunchedMinutes({
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      clockedOutAt: new Date('2026-05-01T09:00:30Z'),
      totalBreakMinutes: 0,
      now,
    })).toBe(0);
    expect(computePunchedMinutes({
      clockedInAt: new Date('2026-05-01T09:00:00Z'),
      clockedOutAt: new Date('2026-05-01T09:01:30Z'),
      totalBreakMinutes: 0,
      now,
    })).toBe(1);
  });
});

describe('validatePunchTransition', () => {
  it('allows PUNCH_IN from NONE', () => {
    expect(validatePunchTransition({ current: 'NONE', action: 'PUNCH_IN' })).toBe(true);
  });
  it('rejects PUNCH_OUT from NONE', () => {
    expect(validatePunchTransition({ current: 'NONE', action: 'PUNCH_OUT' })).toBe(false);
  });
  it('rejects START_BREAK from NONE', () => {
    expect(validatePunchTransition({ current: 'NONE', action: 'START_BREAK' })).toBe(false);
  });
  it('rejects END_BREAK from NONE', () => {
    expect(validatePunchTransition({ current: 'NONE', action: 'END_BREAK' })).toBe(false);
  });

  it('allows PUNCH_OUT and START_BREAK from PUNCHED_IN', () => {
    expect(validatePunchTransition({ current: 'PUNCHED_IN', action: 'PUNCH_OUT' })).toBe(true);
    expect(validatePunchTransition({ current: 'PUNCHED_IN', action: 'START_BREAK' })).toBe(true);
  });
  it('rejects PUNCH_IN from PUNCHED_IN (already punched in)', () => {
    expect(validatePunchTransition({ current: 'PUNCHED_IN', action: 'PUNCH_IN' })).toBe(false);
  });
  it('rejects END_BREAK from PUNCHED_IN', () => {
    expect(validatePunchTransition({ current: 'PUNCHED_IN', action: 'END_BREAK' })).toBe(false);
  });

  it('allows END_BREAK and PUNCH_OUT from ON_BREAK', () => {
    expect(validatePunchTransition({ current: 'ON_BREAK', action: 'END_BREAK' })).toBe(true);
    expect(validatePunchTransition({ current: 'ON_BREAK', action: 'PUNCH_OUT' })).toBe(true);
  });
  it('rejects START_BREAK from ON_BREAK (already on break)', () => {
    expect(validatePunchTransition({ current: 'ON_BREAK', action: 'START_BREAK' })).toBe(false);
  });
  it('rejects PUNCH_IN from ON_BREAK', () => {
    expect(validatePunchTransition({ current: 'ON_BREAK', action: 'PUNCH_IN' })).toBe(false);
  });
});
