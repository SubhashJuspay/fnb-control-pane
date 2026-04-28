import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketFindFirst,
  mockTicketUpdate,
  mockTicketItemFindMany,
  mockDiscountFindMany,
  mockTaxRateFindMany,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketFindFirst: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockDiscountFindMany: vi.fn(),
  mockTaxRateFindMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
    ticketItem: { findMany: mockTicketItemFindMany },
    discount: { findMany: mockDiscountFindMany },
    taxRate: { findMany: mockTaxRateFindMany },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { computeCloseTicketTotals, resolveCloseTicket } from './close-ticket.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

function ctxFor(auth: AuthContext): RequestContext {
  return {
    auth,
    prisma: {
      ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
      ticketItem: { findMany: mockTicketItemFindMany },
      discount: { findMany: mockDiscountFindMany },
      taxRate: { findMany: mockTaxRateFindMany },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'STAFF',
  });

beforeEach(() => {
  mockTicketFindFirst.mockReset();
  mockTicketUpdate.mockReset();
  mockTicketItemFindMany.mockReset();
  mockDiscountFindMany.mockReset();
  mockTaxRateFindMany.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('computeCloseTicketTotals', () => {
  it('sums per-line tax with line + ticket discounts', () => {
    const totals = computeCloseTicketTotals({
      items: [
        { id: 'a', status: 'SERVED', lineSubtotalCents: 1000, taxRatePermille: 825 },
        { id: 'b', status: 'SERVED', lineSubtotalCents: 500, taxRatePermille: 825 },
        { id: 'c', status: 'VOIDED', lineSubtotalCents: 999, taxRatePermille: 825 },
      ],
      discounts: [
        { ticketId: null, ticketItemId: 'a', computedCents: 100, voidedAt: null },
        { ticketId: 'tk', ticketItemId: null, computedCents: 50, voidedAt: null },
        { ticketId: 'tk', ticketItemId: null, computedCents: 999, voidedAt: new Date() },
      ],
    });
    expect(totals.subtotalCents).toBe(1500);
    expect(totals.discountCents).toBe(150);
    // tax: line a net=900*825/10000=74.25→74, line b net=500*825/10000=41.25→41
    expect(totals.taxCents).toBe(115);
    expect(totals.totalCents).toBe(1500 - 150 + 115);
  });

  it('clamps net to zero when ticket discount exceeds subtotal (tax stays on line basis)', () => {
    const totals = computeCloseTicketTotals({
      items: [{ id: 'a', status: 'SERVED', lineSubtotalCents: 100, taxRatePermille: 1000 }],
      discounts: [{ ticketId: 'tk', ticketItemId: null, computedCents: 999, voidedAt: null }],
    });
    // ticket discount only affects net (clamped to 0); per-line tax = 100 * 0.1 = 10.
    expect(totals.subtotalCents).toBe(100);
    expect(totals.discountCents).toBe(999);
    expect(totals.taxCents).toBe(10);
    expect(totals.totalCents).toBe(10);
  });
});

describe('resolveCloseTicket', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveCloseTicket({}, { ticketId: 'tk' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when ticket already CLOSED', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'CLOSED' });
    await expect(
      resolveCloseTicket({}, { ticketId: 'tk' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when items not all SERVED/VOIDED', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockTicketItemFindMany.mockResolvedValueOnce([
      { id: 'a', status: 'FIRED', lineSubtotalCents: 100, menuItem: { taxCategoryId: 'tc' } },
    ]);
    await expect(
      resolveCloseTicket({}, { ticketId: 'tk' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path: snapshots tax, updates totals, audits, publishes', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockTicketItemFindMany.mockResolvedValueOnce([
      {
        id: 'a',
        status: 'SERVED',
        lineSubtotalCents: 1000,
        menuItem: { taxCategoryId: 'tc-food' },
      },
    ]);
    mockDiscountFindMany.mockResolvedValueOnce([]);
    mockTaxRateFindMany.mockResolvedValueOnce([
      { id: 'r', ratePermille: 825, effectiveFrom: new Date(0), effectiveUntil: null },
    ]);
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk' });
    await resolveCloseTicket({}, { ticketId: 'tk', closeNote: 'paid' }, staffCtx());
    const data = mockTicketUpdate.mock.calls[0]?.[0].data;
    expect(data.status).toBe('CLOSED');
    expect(data.subtotalCents).toBe(1000);
    expect(data.discountCents).toBe(0);
    expect(data.taxCents).toBe(83);
    expect(data.totalCents).toBe(1083);
    expect(data.closeNote).toBe('paid');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.closed');
    expect(mockPublish).toHaveBeenCalled();
  });
});
