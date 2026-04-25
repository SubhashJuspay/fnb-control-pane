import { describe, expect, it } from 'vitest';
import { isMenuLiveAt, resolveActiveMenus, nextScheduleWindow } from './schedule.js';
import type { Schedule } from '@repo/validation';

const TZ = 'America/Los_Angeles';

describe('isMenuLiveAt — kind: always', () => {
  const sched: Schedule = { kind: 'always' };

  it('is live for any moment', () => {
    expect(isMenuLiveAt({ schedule: sched, timezone: TZ, at: new Date('2026-04-25T12:00:00Z') })).toBe(true);
  });
});

describe('isMenuLiveAt — kind: weekly', () => {
  const brunch: Schedule = {
    kind: 'weekly',
    windows: [{ days: ['SAT', 'SUN'], start: '08:00', end: '14:00' }],
  };

  it('is live on Saturday at 10am LA time', () => {
    // 2026-04-25 is a Saturday. 10am Pacific = 17:00 UTC (PDT).
    expect(isMenuLiveAt({ schedule: brunch, timezone: TZ, at: new Date('2026-04-25T17:00:00Z') })).toBe(true);
  });

  it('is not live on Saturday at 6am LA time', () => {
    // 6am PDT = 13:00 UTC.
    expect(isMenuLiveAt({ schedule: brunch, timezone: TZ, at: new Date('2026-04-25T13:00:00Z') })).toBe(false);
  });

  it('is not live on Friday', () => {
    // Friday April 24, 2026 at 10am Pacific.
    expect(isMenuLiveAt({ schedule: brunch, timezone: TZ, at: new Date('2026-04-24T17:00:00Z') })).toBe(false);
  });

  it('end time is exclusive', () => {
    // 14:00 PDT exactly = 21:00 UTC.
    expect(isMenuLiveAt({ schedule: brunch, timezone: TZ, at: new Date('2026-04-25T21:00:00Z') })).toBe(false);
  });

  it('start time is inclusive', () => {
    // 08:00 PDT exactly = 15:00 UTC.
    expect(isMenuLiveAt({ schedule: brunch, timezone: TZ, at: new Date('2026-04-25T15:00:00Z') })).toBe(true);
  });
});

describe('resolveActiveMenus', () => {
  it('returns ids of all live menus', () => {
    const at = new Date('2026-04-25T17:00:00Z'); // Saturday 10am PDT
    const result = resolveActiveMenus({
      menus: [
        { id: 'a', isActive: true, schedule: { kind: 'always' } },
        { id: 'b', isActive: true, schedule: { kind: 'weekly', windows: [{ days: ['SAT'], start: '08:00', end: '14:00' }] } },
        { id: 'c', isActive: true, schedule: { kind: 'weekly', windows: [{ days: ['MON'], start: '08:00', end: '11:00' }] } },
      ],
      timezone: TZ,
      at,
    });
    expect(result.sort()).toEqual(['a', 'b']);
  });

  it('skips inactive menus even if schedule says live', () => {
    const at = new Date('2026-04-25T17:00:00Z');
    const result = resolveActiveMenus({
      menus: [{ id: 'a', isActive: false, schedule: { kind: 'always' } }],
      timezone: TZ,
      at,
    });
    expect(result).toEqual([]);
  });
});

describe('nextScheduleWindow', () => {
  const TZ = 'America/Los_Angeles';

  it('always-on returns null (no next window)', () => {
    expect(
      nextScheduleWindow({ schedule: { kind: 'always' }, timezone: TZ, at: new Date('2026-04-25T17:00:00Z') }),
    ).toBeNull();
  });

  it('returns the current window end when currently live', () => {
    const sched: Schedule = { kind: 'weekly', windows: [{ days: ['SAT'], start: '08:00', end: '14:00' }] };
    const at = new Date('2026-04-25T17:00:00Z'); // Saturday 10am PDT
    const w = nextScheduleWindow({ schedule: sched, timezone: TZ, at });
    expect(w).not.toBeNull();
    // current window: Saturday Apr 25 08:00-14:00 PDT
    expect(w!.start.toISOString()).toBe('2026-04-25T15:00:00.000Z'); // 08:00 PDT
    expect(w!.end.toISOString()).toBe('2026-04-25T21:00:00.000Z');   // 14:00 PDT
  });

  it('returns the next future window when not currently live', () => {
    const sched: Schedule = { kind: 'weekly', windows: [{ days: ['SAT'], start: '08:00', end: '14:00' }] };
    const at = new Date('2026-04-23T17:00:00Z'); // Thursday
    const w = nextScheduleWindow({ schedule: sched, timezone: TZ, at });
    expect(w).not.toBeNull();
    expect(w!.start.toISOString()).toBe('2026-04-25T15:00:00.000Z');
    expect(w!.end.toISOString()).toBe('2026-04-25T21:00:00.000Z');
  });
});
