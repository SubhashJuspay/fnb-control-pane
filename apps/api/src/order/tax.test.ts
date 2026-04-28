import { describe, expect, it } from 'vitest';
import { pickTaxRateAt } from './tax.js';

describe('pickTaxRateAt', () => {
  const A = { id: 'a', ratePermille: 800, effectiveFrom: new Date('2026-01-01'), effectiveUntil: new Date('2026-04-01') };
  const B = { id: 'b', ratePermille: 825, effectiveFrom: new Date('2026-04-01'), effectiveUntil: null as Date | null };

  it('picks the rate active at the timestamp', () => {
    expect(pickTaxRateAt({ rates: [A, B], at: new Date('2026-02-15') })).toEqual(A);
    expect(pickTaxRateAt({ rates: [A, B], at: new Date('2026-05-15') })).toEqual(B);
  });

  it('returns null when no rate is active', () => {
    expect(pickTaxRateAt({ rates: [A], at: new Date('2026-05-15') })).toBeNull();
    expect(pickTaxRateAt({ rates: [], at: new Date('2026-05-15') })).toBeNull();
  });

  it('boundaries: effectiveFrom is inclusive, effectiveUntil is exclusive', () => {
    expect(pickTaxRateAt({ rates: [A, B], at: new Date('2026-04-01T00:00:00.000Z') })).toEqual(B);
    // effectiveUntil is the moment the rate stops; exclusive
    expect(pickTaxRateAt({ rates: [A, B], at: new Date('2026-04-01T00:00:00.000Z') })?.id).toBe('b');
  });
});
