import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketFindFirst,
  mockTicketUpdate,
  mockTicketItemFindMany,
  mockDiscountFindMany,
  mockDiscountCreate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketFindFirst: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockDiscountFindMany: vi.fn(),
  mockDiscountCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticket: { findFirst: mockTicketFindFirst, update: mockTicketUpdate },
    ticketItem: { findMany: mockTicketItemFindMany },
    discount: { findMany: mockDiscountFindMany, create: mockDiscountCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import {
  computeTicketDiscountCents,
  resolveApplyTicketDiscount,
} from './apply-ticket-discount.js';

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
      discount: { findMany: mockDiscountFindMany, create: mockDiscountCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx = (): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'MANAGER',
  });

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
  mockDiscountCreate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('computeTicketDiscountCents', () => {
  it('FLAT under available', () => {
    expect(
      computeTicketDiscountCents({
        kind: 'FLAT',
        amountCents: 200,
        ticketSubtotalCents: 1000,
        existingLineDiscountTotal: 0,
        existingTicketDiscountTotal: 0,
      }),
    ).toBe(200);
  });

  it('FLAT throws if exceeds available', () => {
    expect(() =>
      computeTicketDiscountCents({
        kind: 'FLAT',
        amountCents: 1500,
        ticketSubtotalCents: 1000,
        existingLineDiscountTotal: 0,
        existingTicketDiscountTotal: 0,
      }),
    ).toThrow(ConflictError);
  });

  it('PERCENT applied to subtotal minus line discounts', () => {
    expect(
      computeTicketDiscountCents({
        kind: 'PERCENT',
        percentBp: 1000,
        ticketSubtotalCents: 1000,
        existingLineDiscountTotal: 200,
        existingTicketDiscountTotal: 0,
      }),
    ).toBe(80); // 800 * 0.10
  });
});

describe('resolveApplyTicketDiscount', () => {
  it('rejects STAFF role (manager scope)', async () => {
    await expect(
      resolveApplyTicketDiscount(
        {},
        { ticketId: 'tk', kind: 'FLAT', amountCents: 100, reason: 'comp' },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when amount > available subtotal', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockTicketItemFindMany.mockResolvedValueOnce([{ lineSubtotalCents: 100 }]);
    mockDiscountFindMany.mockResolvedValueOnce([]);
    await expect(
      resolveApplyTicketDiscount(
        {},
        { ticketId: 'tk', kind: 'FLAT', amountCents: 999, reason: 'comp' },
        managerCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path FLAT writes audit + publishes', async () => {
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk', status: 'OPEN' });
    mockTicketItemFindMany.mockResolvedValueOnce([{ lineSubtotalCents: 1000 }]);
    mockDiscountFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // recompute totals queries again
    mockTicketItemFindMany.mockResolvedValueOnce([]); // recompute totals
    mockDiscountCreate.mockResolvedValueOnce({ id: 'd-1' });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk' });
    await resolveApplyTicketDiscount(
      {},
      { ticketId: 'tk', kind: 'FLAT', amountCents: 100, reason: 'gift' },
      managerCtx(),
    );
    const data = mockDiscountCreate.mock.calls[0]?.[0].data;
    expect(data.computedCents).toBe(100);
    expect(data.kind).toBe('FLAT');
    expect(data.ticketId).toBe('tk');
    expect(data.ticketItemId).toBeNull();
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'discount.ticket.applied',
    );
  });
});
