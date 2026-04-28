import { describe, expect, it } from 'vitest';
import { computeDayOfWeekMix } from './day-of-week-mix.js';

describe('computeDayOfWeekMix', () => {
  it('returns 7 zero buckets in MON..SUN order when empty', () => {
    const r = computeDayOfWeekMix({ tickets: [], timezone: 'UTC' });
    expect(r.map((b) => b.dayOfWeek)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    expect(r.every((b) => b.ticketCount === 0 && b.revenueCents === 0)).toBe(true);
  });

  it('skips tickets with null closedAt', () => {
    const r = computeDayOfWeekMix({
      tickets: [{ closedAt: null, totalCents: 1000 }],
      timezone: 'UTC',
    });
    expect(r.every((b) => b.ticketCount === 0)).toBe(true);
  });

  it('buckets by ISO weekday in UTC', () => {
    // 2026-04-27 is a Monday. 2026-04-26 is a Sunday.
    const tickets = [
      { closedAt: new Date('2026-04-27T12:00:00Z'), totalCents: 100 }, // MON
      { closedAt: new Date('2026-04-27T18:00:00Z'), totalCents: 200 }, // MON
      { closedAt: new Date('2026-04-26T12:00:00Z'), totalCents: 500 }, // SUN
    ];
    const r = computeDayOfWeekMix({ tickets, timezone: 'UTC' });
    const mon = r.find((b) => b.dayOfWeek === 'MON')!;
    const sun = r.find((b) => b.dayOfWeek === 'SUN')!;
    expect(mon).toEqual({ dayOfWeek: 'MON', ticketCount: 2, revenueCents: 300 });
    expect(sun).toEqual({ dayOfWeek: 'SUN', ticketCount: 1, revenueCents: 500 });
  });

  it('buckets by location timezone — late-night UTC ticket may roll into next/prev day locally', () => {
    // 2026-04-28T05:00:00Z = 2026-04-27T22:00 PDT (Monday in LA).
    const tickets = [{ closedAt: new Date('2026-04-28T05:00:00Z'), totalCents: 1000 }];
    const r = computeDayOfWeekMix({ tickets, timezone: 'America/Los_Angeles' });
    expect(r.find((b) => b.dayOfWeek === 'MON')!.ticketCount).toBe(1);
    expect(r.find((b) => b.dayOfWeek === 'TUE')!.ticketCount).toBe(0);
  });
});
