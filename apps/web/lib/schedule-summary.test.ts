import { describe, expect, it } from 'vitest';
import { summarizeSchedule, type Schedule } from '@repo/ui';

describe('summarizeSchedule', () => {
  it('returns "Live 24/7" for an always-on schedule', () => {
    expect(summarizeSchedule({ kind: 'always' })).toBe('Live 24/7');
  });

  it('returns "No windows" when weekly schedule has no windows', () => {
    expect(summarizeSchedule({ kind: 'weekly', windows: [] })).toBe('No windows');
  });

  it('collapses a contiguous run of weekdays', () => {
    const schedule: Schedule = {
      kind: 'weekly',
      windows: [
        { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], start: '06:00', end: '11:00' },
      ],
    };
    expect(summarizeSchedule(schedule)).toBe('Mon–Fri 6:00 AM–11:00 AM');
  });

  it('renders a single-day window in 12h format', () => {
    const schedule: Schedule = {
      kind: 'weekly',
      windows: [{ days: ['SAT'], start: '08:00', end: '14:00' }],
    };
    expect(summarizeSchedule(schedule)).toBe('Sat 8:00 AM–2:00 PM');
  });

  it('keeps non-contiguous days as a comma-separated list', () => {
    const schedule: Schedule = {
      kind: 'weekly',
      windows: [{ days: ['MON', 'WED'], start: '12:00', end: '13:00' }],
    };
    expect(summarizeSchedule(schedule)).toBe('Mon, Wed 12:00 PM–1:00 PM');
  });

  it('joins multiple windows with " • "', () => {
    const schedule: Schedule = {
      kind: 'weekly',
      windows: [
        { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], start: '06:00', end: '11:00' },
        { days: ['SAT', 'SUN'], start: '07:00', end: '12:00' },
      ],
    };
    expect(summarizeSchedule(schedule)).toBe(
      'Mon–Fri 6:00 AM–11:00 AM • Sat–Sun 7:00 AM–12:00 PM',
    );
  });
});
