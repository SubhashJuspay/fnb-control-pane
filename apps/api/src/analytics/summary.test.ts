import { describe, expect, it } from 'vitest';
import { computeSalesSummary, type SummaryTicket } from './summary.js';

const mk = (overrides: Partial<SummaryTicket>): SummaryTicket => ({
  status: 'CLOSED',
  subtotalCents: 1000,
  discountCents: 0,
  taxCents: 80,
  totalCents: 1080,
  guestId: null,
  ...overrides,
});

describe('computeSalesSummary', () => {
  it('returns zeros for empty input', () => {
    const s = computeSalesSummary({ tickets: [] });
    expect(s).toEqual({
      ticketCount: 0,
      closedTicketCount: 0,
      voidedTicketCount: 0,
      grossSalesCents: 0,
      discountCents: 0,
      taxCents: 0,
      netSalesCents: 0,
      averageTicketCents: 0,
      uniqueGuests: 0,
    });
  });

  it('only counts CLOSED tickets in financial totals', () => {
    const s = computeSalesSummary({
      tickets: [
        mk({ status: 'CLOSED', subtotalCents: 1000, discountCents: 100, taxCents: 90, totalCents: 990 }),
        mk({ status: 'VOIDED', subtotalCents: 5000, discountCents: 0, taxCents: 400, totalCents: 5400 }),
        mk({ status: 'OPEN', subtotalCents: 200, discountCents: 0, taxCents: 16, totalCents: 216 }),
      ],
    });
    expect(s.ticketCount).toBe(3);
    expect(s.closedTicketCount).toBe(1);
    expect(s.voidedTicketCount).toBe(1);
    expect(s.grossSalesCents).toBe(1000);
    expect(s.discountCents).toBe(100);
    expect(s.taxCents).toBe(90);
    expect(s.netSalesCents).toBe(990);
    expect(s.averageTicketCents).toBe(990);
  });

  it('computes averageTicketCents as netSales / closedTicketCount, rounded', () => {
    const s = computeSalesSummary({
      tickets: [
        mk({ totalCents: 1000 }),
        mk({ totalCents: 2000 }),
        mk({ totalCents: 3001 }), // total 6001 / 3 = 2000.333 → rounds to 2000
      ],
    });
    expect(s.averageTicketCents).toBe(2000);
  });

  it('counts uniqueGuests over CLOSED tickets', () => {
    const s = computeSalesSummary({
      tickets: [
        mk({ guestId: 'g1' }),
        mk({ guestId: 'g1' }),
        mk({ guestId: 'g2' }),
        mk({ guestId: null }),
        mk({ guestId: 'g3', status: 'VOIDED' }), // voided shouldn't count
      ],
    });
    expect(s.uniqueGuests).toBe(2);
  });

  it('average is 0 when no closed tickets', () => {
    const s = computeSalesSummary({
      tickets: [mk({ status: 'VOIDED', totalCents: 9999 })],
    });
    expect(s.averageTicketCents).toBe(0);
    expect(s.netSalesCents).toBe(0);
  });
});
