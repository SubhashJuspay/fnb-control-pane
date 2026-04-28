import { describe, expect, it } from 'vitest';
import { computeShiftHours, detectShiftOverlap } from './overlap.js';

const baseShift = (overrides: Partial<{
  id: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
}> = {}) => ({
  id: overrides.id ?? 's1',
  userId: overrides.userId ?? 'u1',
  startsAt: overrides.startsAt ?? new Date('2026-05-01T09:00:00Z'),
  endsAt: overrides.endsAt ?? new Date('2026-05-01T17:00:00Z'),
  status: overrides.status ?? ('PUBLISHED' as const),
});

describe('computeShiftHours', () => {
  it('returns 8 hours for a 09:00→17:00 shift', () => {
    expect(computeShiftHours({
      startsAt: new Date('2026-05-01T09:00:00Z'),
      endsAt: new Date('2026-05-01T17:00:00Z'),
    })).toBe(8);
  });
  it('handles fractional hours', () => {
    expect(computeShiftHours({
      startsAt: new Date('2026-05-01T09:00:00Z'),
      endsAt: new Date('2026-05-01T09:30:00Z'),
    })).toBe(0.5);
  });
  it('returns 0 for zero-length input', () => {
    expect(computeShiftHours({
      startsAt: new Date('2026-05-01T09:00:00Z'),
      endsAt: new Date('2026-05-01T09:00:00Z'),
    })).toBe(0);
  });
});

describe('detectShiftOverlap', () => {
  const candidate = {
    userId: 'u1',
    startsAt: new Date('2026-05-01T12:00:00Z'),
    endsAt: new Date('2026-05-01T18:00:00Z'),
  };

  it('returns no conflicts when existing list is empty', () => {
    expect(detectShiftOverlap({ candidate, existing: [] })).toEqual([]);
  });

  it('ignores shifts for different users', () => {
    expect(detectShiftOverlap({
      candidate,
      existing: [baseShift({ userId: 'u2' })],
    })).toEqual([]);
  });

  it('ignores CANCELLED shifts', () => {
    expect(detectShiftOverlap({
      candidate,
      existing: [baseShift({ status: 'CANCELLED' })],
    })).toEqual([]);
  });

  it('ignores abutting shifts (end exactly equals start)', () => {
    expect(detectShiftOverlap({
      candidate: {
        userId: 'u1',
        startsAt: new Date('2026-05-01T17:00:00Z'),
        endsAt: new Date('2026-05-01T20:00:00Z'),
      },
      existing: [baseShift()],
    })).toEqual([]);
  });

  it('detects partial overlap', () => {
    const existing = baseShift();
    const result = detectShiftOverlap({ candidate, existing: [existing] });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('s1');
  });

  it('detects full overlap', () => {
    const existing = baseShift({
      startsAt: new Date('2026-05-01T08:00:00Z'),
      endsAt: new Date('2026-05-01T20:00:00Z'),
    });
    expect(detectShiftOverlap({ candidate, existing: [existing] })).toHaveLength(1);
  });

  it('detects identical times', () => {
    const existing = baseShift({
      startsAt: new Date('2026-05-01T12:00:00Z'),
      endsAt: new Date('2026-05-01T18:00:00Z'),
    });
    expect(detectShiftOverlap({ candidate, existing: [existing] })).toHaveLength(1);
  });

  it('detects DRAFT overlap (status PUBLISHED is not required)', () => {
    const existing = baseShift({ status: 'DRAFT' });
    expect(detectShiftOverlap({ candidate, existing: [existing] })).toHaveLength(1);
  });

  it('respects excludeId (self-update case)', () => {
    const existing = baseShift({ id: 'self' });
    expect(detectShiftOverlap({ candidate, existing: [existing], excludeId: 'self' })).toEqual([]);
  });

  it('returns multiple conflicts when several overlap', () => {
    const a = baseShift({ id: 'a', startsAt: new Date('2026-05-01T11:00:00Z'), endsAt: new Date('2026-05-01T13:00:00Z') });
    const b = baseShift({ id: 'b', startsAt: new Date('2026-05-01T15:00:00Z'), endsAt: new Date('2026-05-01T19:00:00Z') });
    const result = detectShiftOverlap({ candidate, existing: [a, b] });
    expect(result.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });
});
