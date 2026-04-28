import { describe, expect, it } from 'vitest';
import { computeLineSubtotalCents, computeTicketTotalsCents } from './pricing.js';

describe('computeLineSubtotalCents', () => {
  it('quantity × (unit + sum(modifier deltas))', () => {
    expect(
      computeLineSubtotalCents({
        unitPriceCents: 450,
        quantity: 2,
        modifiers: [{ priceDeltaCents: 75 }, { priceDeltaCents: 50 }],
      }),
    ).toEqual({ modifiersTotalCents: 125, lineSubtotalCents: (450 + 125) * 2 });
  });

  it('zero modifiers ok', () => {
    expect(
      computeLineSubtotalCents({ unitPriceCents: 350, quantity: 3, modifiers: [] }),
    ).toEqual({ modifiersTotalCents: 0, lineSubtotalCents: 1050 });
  });

  it('negative modifier delta reduces price', () => {
    expect(
      computeLineSubtotalCents({
        unitPriceCents: 500,
        quantity: 1,
        modifiers: [{ priceDeltaCents: -50 }],
      }),
    ).toEqual({ modifiersTotalCents: -50, lineSubtotalCents: 450 });
  });
});

describe('computeTicketTotalsCents', () => {
  it('sums non-voided lines, applies ticket discounts, then tax', () => {
    expect(
      computeTicketTotalsCents({
        items: [
          { lineSubtotalCents: 1000, lineDiscountCents: 0, status: 'FIRED' },
          { lineSubtotalCents: 500, lineDiscountCents: 100, status: 'SERVED' },
          { lineSubtotalCents: 200, lineDiscountCents: 0, status: 'VOIDED' }, // excluded
        ],
        ticketDiscountCents: 100,
        taxRatePermille: 825,
      }),
    ).toEqual({
      // sum of non-voided line subtotals = 1500; minus line discounts = 100; minus ticket discount = 100 → net 1300
      // tax = 1300 * 825 / 10000 = 107.25 → rounded to 107
      subtotalCents: 1500,
      discountCents: 200,
      taxCents: 107,
      totalCents: 1300 + 107,
    });
  });

  it('handles zero tax', () => {
    expect(
      computeTicketTotalsCents({
        items: [{ lineSubtotalCents: 1000, lineDiscountCents: 0, status: 'NEW' }],
        ticketDiscountCents: 0,
        taxRatePermille: 0,
      }),
    ).toEqual({ subtotalCents: 1000, discountCents: 0, taxCents: 0, totalCents: 1000 });
  });

  it('discount cannot drop net below zero (clamped)', () => {
    expect(
      computeTicketTotalsCents({
        items: [{ lineSubtotalCents: 100, lineDiscountCents: 0, status: 'NEW' }],
        ticketDiscountCents: 500,    // would over-discount
        taxRatePermille: 825,
      }),
    ).toEqual({ subtotalCents: 100, discountCents: 500, taxCents: 0, totalCents: 0 });
  });

  it('rounds tax to nearest cent (banker-ish — half up)', () => {
    expect(
      computeTicketTotalsCents({
        items: [{ lineSubtotalCents: 555, lineDiscountCents: 0, status: 'NEW' }],
        ticketDiscountCents: 0,
        taxRatePermille: 100,    // 1%
      }),
    ).toEqual({
      subtotalCents: 555,
      discountCents: 0,
      taxCents: 6,    // 5.55 → 6
      totalCents: 561,
    });
  });
});
