import { describe, expect, it } from 'vitest';
import { dateRangeSchema, topItemsSortSchema } from './analytics.js';

describe('dateRangeSchema', () => {
  it('accepts a normal one-week range', () => {
    expect(
      dateRangeSchema.safeParse({
        from: '2026-04-21',
        to: '2026-04-28',
      }).success,
    ).toBe(true);
  });

  it('accepts from == to (single day)', () => {
    expect(
      dateRangeSchema.safeParse({
        from: '2026-04-28',
        to: '2026-04-28',
      }).success,
    ).toBe(true);
  });

  it('rejects to before from', () => {
    expect(
      dateRangeSchema.safeParse({
        from: '2026-04-28',
        to: '2026-04-27',
      }).success,
    ).toBe(false);
  });

  it('rejects spans greater than 92 days', () => {
    expect(
      dateRangeSchema.safeParse({
        from: '2026-01-01',
        to: '2026-04-30', // 119 days
      }).success,
    ).toBe(false);
  });

  it('accepts span exactly 92 days', () => {
    // 2026-01-01 + 91 days = 2026-04-02 → range covers 92 days inclusive
    expect(
      dateRangeSchema.safeParse({
        from: '2026-01-01',
        to: '2026-04-02',
      }).success,
    ).toBe(true);
  });

  it('rejects span of 93 days', () => {
    expect(
      dateRangeSchema.safeParse({
        from: '2026-01-01',
        to: '2026-04-03',
      }).success,
    ).toBe(false);
  });

  it('coerces Date inputs', () => {
    expect(
      dateRangeSchema.safeParse({
        from: new Date('2026-04-01'),
        to: new Date('2026-04-08'),
      }).success,
    ).toBe(true);
  });

  it('rejects invalid date strings', () => {
    expect(dateRangeSchema.safeParse({ from: 'nope', to: '2026-04-28' }).success).toBe(false);
  });
});

describe('topItemsSortSchema', () => {
  it('accepts QUANTITY', () => {
    expect(topItemsSortSchema.safeParse('QUANTITY').success).toBe(true);
  });
  it('accepts REVENUE', () => {
    expect(topItemsSortSchema.safeParse('REVENUE').success).toBe(true);
  });
  it('accepts TICKETS', () => {
    expect(topItemsSortSchema.safeParse('TICKETS').success).toBe(true);
  });
  it('rejects unknown sort', () => {
    expect(topItemsSortSchema.safeParse('PROFIT').success).toBe(false);
  });
});
