import { describe, expect, it } from 'vitest';
import { estimateReadyAt } from './estimate.js';

describe('estimateReadyAt', () => {
  it('returns confirmedAt+10min when pickupAt is earlier', () => {
    const confirmedAt = new Date('2026-04-29T12:00:00Z');
    const pickupAt = new Date('2026-04-29T12:05:00Z');
    const out = estimateReadyAt({ pickupAt, confirmedAt });
    expect(out.toISOString()).toBe('2026-04-29T12:10:00.000Z');
  });

  it('returns pickupAt when later than confirmedAt+10min', () => {
    const confirmedAt = new Date('2026-04-29T12:00:00Z');
    const pickupAt = new Date('2026-04-29T13:00:00Z');
    const out = estimateReadyAt({ pickupAt, confirmedAt });
    expect(out.toISOString()).toBe('2026-04-29T13:00:00.000Z');
  });

  it('honors custom minPrepMinutes', () => {
    const confirmedAt = new Date('2026-04-29T12:00:00Z');
    const pickupAt = new Date('2026-04-29T12:01:00Z');
    const out = estimateReadyAt({ pickupAt, confirmedAt, minPrepMinutes: 25 });
    expect(out.toISOString()).toBe('2026-04-29T12:25:00.000Z');
  });

  it('handles equal times by returning the same value', () => {
    const confirmedAt = new Date('2026-04-29T12:00:00Z');
    const pickupAt = new Date('2026-04-29T12:10:00Z');
    const out = estimateReadyAt({ pickupAt, confirmedAt });
    expect(out.toISOString()).toBe('2026-04-29T12:10:00.000Z');
  });
});
