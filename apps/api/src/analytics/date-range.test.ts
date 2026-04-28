import { describe, expect, it } from 'vitest';
import { resolveBusinessDayRange } from './date-range.js';

describe('resolveBusinessDayRange', () => {
  it('returns the same instant for cutoff 00:00 (calendar day) in UTC', () => {
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-26T00:00:00Z'),
      timezone: 'UTC',
      businessDayCutoff: '00:00',
    });
    expect(r.fromUtc.toISOString()).toBe('2026-04-26T00:00:00.000Z');
    expect(r.toUtc.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('cutoff at 04:00 — Apr 26 business day in America/Los_Angeles', () => {
    // PST/PDT in April → UTC-7 (PDT). 04:00 local → 11:00 UTC.
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-26T00:00:00Z'),
      timezone: 'America/Los_Angeles',
      businessDayCutoff: '04:00',
    });
    expect(r.fromUtc.toISOString()).toBe('2026-04-26T11:00:00.000Z');
    expect(r.toUtc.toISOString()).toBe('2026-04-27T11:00:00.000Z');
  });

  it('a 02:00 LA-local ticket on Apr 27 falls into business-day Apr 26', () => {
    // The ticket happened at 02:00 PDT on Apr 27 = 09:00 UTC on Apr 27.
    // Business-day Apr 26 with 04:00 cutoff covers 11:00 UTC Apr 26 → 11:00 UTC Apr 27.
    const ticket = new Date('2026-04-27T09:00:00Z'); // 02:00 PDT
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-26T00:00:00Z'),
      timezone: 'America/Los_Angeles',
      businessDayCutoff: '04:00',
    });
    expect(ticket.getTime()).toBeGreaterThanOrEqual(r.fromUtc.getTime());
    expect(ticket.getTime()).toBeLessThan(r.toUtc.getTime());
  });

  it('a 05:00 LA-local ticket on Apr 27 does NOT fall into business-day Apr 26', () => {
    // 05:00 PDT Apr 27 = 12:00 UTC Apr 27 — past the 11:00 UTC cutoff.
    const ticket = new Date('2026-04-27T12:00:00Z');
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-26T00:00:00Z'),
      timezone: 'America/Los_Angeles',
      businessDayCutoff: '04:00',
    });
    expect(ticket.getTime()).toBeGreaterThanOrEqual(r.toUtc.getTime());
  });

  it('multi-day range from Apr 26 to Apr 28 spans 3 business days', () => {
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-28T00:00:00Z'),
      timezone: 'America/Los_Angeles',
      businessDayCutoff: '04:00',
    });
    expect(r.fromUtc.toISOString()).toBe('2026-04-26T11:00:00.000Z');
    expect(r.toUtc.toISOString()).toBe('2026-04-29T11:00:00.000Z');
  });

  it('handles non-half-hour cutoff like 04:30', () => {
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-26T00:00:00Z'),
      timezone: 'America/Los_Angeles',
      businessDayCutoff: '04:30',
    });
    expect(r.fromUtc.toISOString()).toBe('2026-04-26T11:30:00.000Z');
    expect(r.toUtc.toISOString()).toBe('2026-04-27T11:30:00.000Z');
  });

  it('uses local-day naming based on the from/to Date (UTC date components)', () => {
    // Different timezone, same Date input.
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-26T00:00:00Z'),
      timezone: 'Asia/Kolkata', // UTC+5:30
      businessDayCutoff: '04:00',
    });
    // Apr 26 04:00 IST → Apr 25 22:30 UTC.
    expect(r.fromUtc.toISOString()).toBe('2026-04-25T22:30:00.000Z');
    expect(r.toUtc.toISOString()).toBe('2026-04-26T22:30:00.000Z');
  });

  it('from == to gives a single business day', () => {
    const r = resolveBusinessDayRange({
      from: new Date('2026-04-26T00:00:00Z'),
      to: new Date('2026-04-26T00:00:00Z'),
      timezone: 'UTC',
      businessDayCutoff: '04:00',
    });
    const diffHours = (r.toUtc.getTime() - r.fromUtc.getTime()) / 3_600_000;
    expect(diffHours).toBe(24);
  });
});
