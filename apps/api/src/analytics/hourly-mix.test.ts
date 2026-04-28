import { describe, expect, it } from 'vitest';
import { computeHourlyMix } from './hourly-mix.js';

describe('computeHourlyMix', () => {
  it('returns 24 buckets all zero when no tickets', () => {
    const r = computeHourlyMix({ tickets: [], timezone: 'UTC' });
    expect(r).toHaveLength(24);
    expect(r.map((b) => b.hour)).toEqual([...Array(24).keys()]);
    expect(r.every((b) => b.ticketCount === 0 && b.revenueCents === 0)).toBe(true);
  });

  it('skips tickets with null closedAt', () => {
    const r = computeHourlyMix({
      tickets: [{ closedAt: null, totalCents: 1000 }],
      timezone: 'UTC',
    });
    expect(r.every((b) => b.ticketCount === 0)).toBe(true);
  });

  it('buckets by UTC hour when timezone is UTC', () => {
    const tickets = [
      { closedAt: new Date('2026-04-26T10:30:00Z'), totalCents: 500 },
      { closedAt: new Date('2026-04-26T10:45:00Z'), totalCents: 700 },
      { closedAt: new Date('2026-04-26T18:15:00Z'), totalCents: 1200 },
    ];
    const r = computeHourlyMix({ tickets, timezone: 'UTC' });
    expect(r[10]).toEqual({ hour: 10, ticketCount: 2, revenueCents: 1200 });
    expect(r[18]).toEqual({ hour: 18, ticketCount: 1, revenueCents: 1200 });
    expect(r[11]!.ticketCount).toBe(0);
  });

  it('buckets by location timezone (LA)', () => {
    // 18:30 UTC on Apr 26 = 11:30 PDT. 02:00 UTC Apr 27 = 19:00 PDT Apr 26.
    const tickets = [
      { closedAt: new Date('2026-04-26T18:30:00Z'), totalCents: 1000 },
      { closedAt: new Date('2026-04-27T02:00:00Z'), totalCents: 2000 },
    ];
    const r = computeHourlyMix({ tickets, timezone: 'America/Los_Angeles' });
    expect(r[11]).toEqual({ hour: 11, ticketCount: 1, revenueCents: 1000 });
    expect(r[19]).toEqual({ hour: 19, ticketCount: 1, revenueCents: 2000 });
  });

  it('hour 0 (midnight) buckets correctly', () => {
    const tickets = [{ closedAt: new Date('2026-04-26T00:15:00Z'), totalCents: 100 }];
    const r = computeHourlyMix({ tickets, timezone: 'UTC' });
    expect(r[0]).toEqual({ hour: 0, ticketCount: 1, revenueCents: 100 });
  });
});
