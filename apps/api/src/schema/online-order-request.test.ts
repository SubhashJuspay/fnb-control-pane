import { describe, expect, it } from 'vitest';
import {
  buildOnlineOrderWhere,
  projectOnlineOrderTracking,
} from './online-order-request.js';

describe('buildOnlineOrderWhere', () => {
  it('filters by locationId only when no filter provided', () => {
    expect(buildOnlineOrderWhere('loc-1', null)).toEqual({ locationId: 'loc-1' });
  });

  it('adds confirmStatus when present', () => {
    expect(buildOnlineOrderWhere('loc-1', { status: 'PENDING' })).toEqual({
      locationId: 'loc-1',
      confirmStatus: 'PENDING',
    });
  });

  it('adds createdAt range when fromDate/toDate present', () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');
    expect(buildOnlineOrderWhere('loc-1', { fromDate: from, toDate: to })).toEqual({
      locationId: 'loc-1',
      createdAt: { gte: from, lte: to },
    });
  });
});

describe('projectOnlineOrderTracking', () => {
  const baseRequest = {
    customerName: 'Bob',
    pickupAt: new Date('2026-04-29T12:00:00Z'),
    pickupKind: 'ASAP' as const,
    confirmStatus: 'PENDING' as const,
    confirmedAt: null,
    rejectReason: null,
    paymentMode: 'PAY_AT_PICKUP' as const,
    paymentStatus: null,
  };
  const baseTicket = {
    shortNumber: 12,
    status: 'OPEN' as const,
    subtotalCents: 1000,
    taxCents: 80,
    totalCents: 1080,
    tipCents: 0,
    closedAt: null,
  };
  const baseExtras = {
    tenantName: 'Acme',
    locationName: 'Mission St',
    locationAddress: null,
    locationPhone: null,
  };
  const item = (
    name: string,
    qty: number,
    status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED',
  ) => ({
    quantity: qty,
    nameSnapshot: name,
    status,
    unitPriceCents: 500,
    modifiersTotalCents: 0,
    lineSubtotalCents: 500 * qty,
    modifiers: [],
  });

  it('formats item summary, isReady false, no estimate when PENDING', () => {
    const out = projectOnlineOrderTracking({
      request: baseRequest,
      ticket: baseTicket,
      ...baseExtras,
      items: [item('Latte', 1, 'NEW'), item('Croissant', 2, 'NEW')],
    });
    expect(out.itemSummary).toBe('1 Latte, 2 Croissant');
    expect(out.isReady).toBe(false);
    expect(out.estimatedReadyAt).toBeNull();
    expect(out.shortNumber).toBe(12);
  });

  it('drops VOIDED items from summary and isReady check', () => {
    const out = projectOnlineOrderTracking({
      request: baseRequest,
      ticket: baseTicket,
      ...baseExtras,
      items: [item('Latte', 1, 'READY'), item('Croissant', 2, 'VOIDED')],
    });
    expect(out.itemSummary).toBe('1 Latte');
    expect(out.isReady).toBe(true);
  });

  it('computes estimatedReadyAt when CONFIRMED', () => {
    const confirmedAt = new Date('2026-04-29T11:00:00Z');
    const out = projectOnlineOrderTracking({
      request: {
        ...baseRequest,
        confirmStatus: 'CONFIRMED',
        confirmedAt,
      },
      ticket: baseTicket,
      ...baseExtras,
      items: [item('Latte', 1, 'FIRED')],
    });
    expect(out.estimatedReadyAt).not.toBeNull();
    expect(out.estimatedReadyAt!.getTime()).toBe(baseRequest.pickupAt.getTime());
  });

  it('reports 0 items for empty live list', () => {
    const out = projectOnlineOrderTracking({
      request: baseRequest,
      ticket: baseTicket,
      ...baseExtras,
      items: [item('X', 1, 'VOIDED')],
    });
    expect(out.itemSummary).toBe('0 items');
    expect(out.isReady).toBe(false);
  });
});
