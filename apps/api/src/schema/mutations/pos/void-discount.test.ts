import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDiscountFindUnique,
  mockDiscountUpdate,
  mockDiscountFindMany,
  mockTicketItemFindMany,
  mockTicketUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockDiscountFindUnique: vi.fn(),
  mockDiscountUpdate: vi.fn(),
  mockDiscountFindMany: vi.fn(),
  mockTicketItemFindMany: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    discount: {
      findUnique: mockDiscountFindUnique,
      update: mockDiscountUpdate,
      findMany: mockDiscountFindMany,
    },
    ticketItem: { findMany: mockTicketItemFindMany },
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
import { resolveVoidDiscount } from './void-discount.js';

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
      discount: {
        findUnique: mockDiscountFindUnique,
        update: mockDiscountUpdate,
        findMany: mockDiscountFindMany,
      },
      ticketItem: { findMany: mockTicketItemFindMany },
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
  mockDiscountFindUnique.mockReset();
  mockDiscountUpdate.mockReset();
  mockDiscountFindMany.mockReset();
  mockTicketItemFindMany.mockReset();
  mockTicketUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  mockTicketItemFindMany.mockResolvedValue([]);
  mockDiscountFindMany.mockResolvedValue([]);
});

describe('resolveVoidDiscount', () => {
  it('rejects STAFF role', async () => {
    await expect(
      resolveVoidDiscount(
        {},
        { discountId: 'd', voidReason: 'wrong amount' },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects already-voided discount', async () => {
    mockDiscountFindUnique.mockResolvedValueOnce({
      id: 'd',
      locationId: 'loc-1',
      voidedAt: new Date(),
      ticketId: 'tk',
      ticketItemId: null,
      ticketItem: null,
    });
    await expect(
      resolveVoidDiscount(
        {},
        { discountId: 'd', voidReason: 'wrong amount' },
        managerCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path sets voidedAt + recomputes ticket totals', async () => {
    mockDiscountFindUnique.mockResolvedValueOnce({
      id: 'd',
      locationId: 'loc-1',
      voidedAt: null,
      ticketId: 'tk',
      ticketItemId: null,
      ticketItem: null,
    });
    mockDiscountUpdate.mockResolvedValueOnce({ id: 'd' });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk' });
    await resolveVoidDiscount(
      {},
      { discountId: 'd', voidReason: 'wrong amount' },
      managerCtx(),
    );
    const data = mockDiscountUpdate.mock.calls[0]?.[0].data;
    expect(data.voidedAt).toBeInstanceOf(Date);
    expect(data.voidReason).toBe('wrong amount');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('discount.voided');
    // Recompute happens
    expect(mockTicketUpdate).toHaveBeenCalled();
  });
});
