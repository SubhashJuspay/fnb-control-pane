import { describe, expect, it } from 'vitest';
import { computeServerPerformance, type ServerInputTicket } from './servers.js';

const t = (overrides: Partial<ServerInputTicket>): ServerInputTicket => ({
  openedById: 'u-1',
  openedByName: 'Alice',
  totalCents: 1000,
  status: 'CLOSED',
  items: [{ status: 'SERVED', servedById: 'u-1' }],
  ...overrides,
});

describe('computeServerPerformance', () => {
  it('returns empty list with no tickets', () => {
    expect(computeServerPerformance({ tickets: [] })).toEqual([]);
  });

  it('groups by openedById, summing totals and ticket counts (CLOSED only)', () => {
    const r = computeServerPerformance({
      tickets: [
        t({ openedById: 'a', openedByName: 'Alice', totalCents: 1000 }),
        t({ openedById: 'a', openedByName: 'Alice', totalCents: 2000 }),
        t({ openedById: 'b', openedByName: 'Bob', totalCents: 3000 }),
      ],
    });
    const a = r.find((x) => x.openedById === 'a')!;
    expect(a.ticketCount).toBe(2);
    expect(a.revenueCents).toBe(3000);
    expect(a.averageTicketCents).toBe(1500);
    const b = r.find((x) => x.openedById === 'b')!;
    expect(b.ticketCount).toBe(1);
    expect(b.revenueCents).toBe(3000);
  });

  it('excludes VOIDED tickets from revenue/ticketCount', () => {
    const r = computeServerPerformance({
      tickets: [
        t({ openedById: 'a', status: 'CLOSED', totalCents: 1000 }),
        t({ openedById: 'a', status: 'VOIDED', totalCents: 9999 }),
      ],
    });
    expect(r[0]!.revenueCents).toBe(1000);
    expect(r[0]!.ticketCount).toBe(1);
  });

  it('itemsServed counts items with this server as servedBy and not VOIDED', () => {
    const r = computeServerPerformance({
      tickets: [
        t({
          openedById: 'a',
          items: [
            { status: 'SERVED', servedById: 'a' },
            { status: 'SERVED', servedById: 'a' },
            { status: 'SERVED', servedById: 'b' },
            { status: 'VOIDED', servedById: 'a' },
            { status: 'NEW', servedById: null },
          ],
        }),
      ],
    });
    expect(r.find((x) => x.openedById === 'a')!.itemsServed).toBe(2);
  });

  it('voidRate = voided lines / total lines across this server tickets', () => {
    const r = computeServerPerformance({
      tickets: [
        t({
          openedById: 'a',
          items: [
            { status: 'SERVED', servedById: 'a' },
            { status: 'SERVED', servedById: 'a' },
            { status: 'VOIDED', servedById: 'a' },
            { status: 'VOIDED', servedById: 'a' },
          ],
        }),
      ],
    });
    expect(r[0]!.voidRate).toBeCloseTo(0.5, 5);
  });

  it('voidRate = 0 when no items', () => {
    const r = computeServerPerformance({
      tickets: [t({ openedById: 'a', items: [] })],
    });
    expect(r[0]!.voidRate).toBe(0);
  });

  it('average is 0 when ticketCount is 0 (only voided tickets)', () => {
    const r = computeServerPerformance({
      tickets: [t({ openedById: 'a', status: 'VOIDED', totalCents: 1000 })],
    });
    expect(r[0]!.averageTicketCents).toBe(0);
    expect(r[0]!.revenueCents).toBe(0);
  });
});
