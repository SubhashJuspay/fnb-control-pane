import { describe, expect, it } from 'vitest';
import { computeTopItems, type RawLine } from './top-items.js';

const mk = (overrides: Partial<RawLine>): RawLine => ({
  menuItemId: 'item-1',
  menuItemName: 'Latte',
  quantity: 1,
  lineSubtotalCents: 450,
  lineDiscountCents: 0,
  ticketId: 't-1',
  status: 'SERVED',
  ...overrides,
});

describe('computeTopItems', () => {
  it('returns empty when no lines', () => {
    expect(computeTopItems({ lines: [], limit: 10, by: 'QUANTITY' })).toEqual([]);
  });

  it('aggregates quantity, revenue, and ticket count per menuItemId', () => {
    const lines: RawLine[] = [
      mk({ menuItemId: 'i-latte', menuItemName: 'Latte', quantity: 2, lineSubtotalCents: 900, ticketId: 't-1' }),
      mk({ menuItemId: 'i-latte', menuItemName: 'Latte', quantity: 1, lineSubtotalCents: 450, ticketId: 't-2' }),
      mk({ menuItemId: 'i-croissant', menuItemName: 'Croissant', quantity: 3, lineSubtotalCents: 1050, ticketId: 't-1' }),
    ];
    const result = computeTopItems({ lines, limit: 10, by: 'QUANTITY' });
    const latte = result.find((r) => r.menuItemId === 'i-latte')!;
    expect(latte.quantitySold).toBe(3);
    expect(latte.revenueCents).toBe(1350);
    expect(latte.ticketCount).toBe(2);
    const cro = result.find((r) => r.menuItemId === 'i-croissant')!;
    expect(cro.quantitySold).toBe(3);
    expect(cro.ticketCount).toBe(1);
  });

  it('subtracts lineDiscountCents from revenue', () => {
    const lines: RawLine[] = [
      mk({ menuItemId: 'i-x', lineSubtotalCents: 1000, lineDiscountCents: 200 }),
    ];
    expect(computeTopItems({ lines, limit: 10, by: 'REVENUE' })[0]!.revenueCents).toBe(800);
  });

  it('filters out VOIDED lines', () => {
    const lines: RawLine[] = [
      mk({ menuItemId: 'i-1', quantity: 5, status: 'VOIDED' }),
      mk({ menuItemId: 'i-1', quantity: 1, status: 'SERVED' }),
    ];
    const result = computeTopItems({ lines, limit: 10, by: 'QUANTITY' });
    expect(result).toHaveLength(1);
    expect(result[0]!.quantitySold).toBe(1);
  });

  it('sorts by QUANTITY descending', () => {
    const lines: RawLine[] = [
      mk({ menuItemId: 'a', quantity: 1 }),
      mk({ menuItemId: 'b', quantity: 5 }),
      mk({ menuItemId: 'c', quantity: 3 }),
    ];
    const r = computeTopItems({ lines, limit: 10, by: 'QUANTITY' });
    expect(r.map((x) => x.menuItemId)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by REVENUE descending', () => {
    const lines: RawLine[] = [
      mk({ menuItemId: 'a', lineSubtotalCents: 100 }),
      mk({ menuItemId: 'b', lineSubtotalCents: 999 }),
      mk({ menuItemId: 'c', lineSubtotalCents: 500 }),
    ];
    const r = computeTopItems({ lines, limit: 10, by: 'REVENUE' });
    expect(r.map((x) => x.menuItemId)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by TICKETS descending', () => {
    const lines: RawLine[] = [
      mk({ menuItemId: 'a', ticketId: 't1' }),
      mk({ menuItemId: 'a', ticketId: 't2' }),
      mk({ menuItemId: 'a', ticketId: 't3' }),
      mk({ menuItemId: 'b', ticketId: 't1' }),
    ];
    const r = computeTopItems({ lines, limit: 10, by: 'TICKETS' });
    expect(r[0]!.menuItemId).toBe('a');
    expect(r[0]!.ticketCount).toBe(3);
    expect(r[1]!.menuItemId).toBe('b');
  });

  it('respects the limit', () => {
    const lines: RawLine[] = [
      mk({ menuItemId: 'a', quantity: 5 }),
      mk({ menuItemId: 'b', quantity: 4 }),
      mk({ menuItemId: 'c', quantity: 3 }),
    ];
    const r = computeTopItems({ lines, limit: 2, by: 'QUANTITY' });
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.menuItemId)).toEqual(['a', 'b']);
  });
});
