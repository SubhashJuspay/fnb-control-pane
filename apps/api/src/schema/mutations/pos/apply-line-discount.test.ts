import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTicketItemFindUnique,
  mockTicketItemFindMany,
  mockDiscountFindMany,
  mockDiscountCreate,
  mockTicketUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTicketItemFindUnique: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockDiscountFindMany: vi.fn(),
  mockDiscountCreate: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticketItem: {
      findUnique: mockTicketItemFindUnique,
      findMany: mockTicketItemFindMany,
    },
    discount: { findMany: mockDiscountFindMany, create: mockDiscountCreate },
    ticket: { update: mockTicketUpdate },
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
  computeLineDiscountCents,
  resolveApplyLineDiscount,
} from './apply-line-discount.js';

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
      ticketItem: {
        findUnique: mockTicketItemFindUnique,
        findMany: mockTicketItemFindMany,
      },
      discount: { findMany: mockDiscountFindMany, create: mockDiscountCreate },
      ticket: { update: mockTicketUpdate },
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
  mockTicketItemFindUnique.mockReset();
  mockTicketItemFindMany.mockReset();
  mockDiscountFindMany.mockReset();
  mockDiscountCreate.mockReset();
  mockTicketUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  mockTicketItemFindMany.mockResolvedValue([]);
});

describe('computeLineDiscountCents', () => {
  it('FLAT under remaining', () => {
    expect(
      computeLineDiscountCents({
        kind: 'FLAT',
        amountCents: 50,
        lineSubtotalCents: 100,
        existingLineDiscountTotal: 0,
      }),
    ).toBe(50);
  });

  it('FLAT throws when exceeds remaining', () => {
    expect(() =>
      computeLineDiscountCents({
        kind: 'FLAT',
        amountCents: 200,
        lineSubtotalCents: 100,
        existingLineDiscountTotal: 0,
      }),
    ).toThrow(ConflictError);
  });

  it('PERCENT computes off remaining', () => {
    expect(
      computeLineDiscountCents({
        kind: 'PERCENT',
        percentBp: 2000,
        lineSubtotalCents: 1000,
        existingLineDiscountTotal: 200,
      }),
    ).toBe(160); // 800 * 0.20
  });
});

describe('resolveApplyLineDiscount', () => {
  it('rejects STAFF role', async () => {
    await expect(
      resolveApplyLineDiscount(
        {},
        { ticketItemId: 'ti', kind: 'FLAT', amountCents: 100, reason: 'r' },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects on voided line', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'VOIDED',
      lineSubtotalCents: 500,
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    await expect(
      resolveApplyLineDiscount(
        {},
        { ticketItemId: 'ti', kind: 'FLAT', amountCents: 100, reason: 'r' },
        managerCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path PERCENT computed against remaining', async () => {
    mockTicketItemFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'NEW',
      lineSubtotalCents: 1000,
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    mockDiscountFindMany
      .mockResolvedValueOnce([{ computedCents: 200 }]) // existing on this line
      .mockResolvedValueOnce([]); // recompute totals
    mockDiscountCreate.mockResolvedValueOnce({ id: 'd-1' });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk' });
    await resolveApplyLineDiscount(
      {},
      { ticketItemId: 'ti', kind: 'PERCENT', percentBp: 1000, reason: 'happy hour' },
      managerCtx(),
    );
    expect(mockDiscountCreate.mock.calls[0]?.[0].data.computedCents).toBe(80); // 800 * 0.10
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'discount.line.applied',
    );
  });
});
