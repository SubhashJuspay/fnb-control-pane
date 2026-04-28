import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindFirst,
  mockFindMany,
  mockUpdateMany,
  mockTicketUpdate,
  mockUpdate,
  mockTx,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => {
  const mockFindFirst = vi.fn();
  const mockFindMany = vi.fn();
  const mockUpdateMany = vi.fn();
  const mockTicketUpdate = vi.fn();
  const mockUpdate = vi.fn();
  const mockAuditCreate = vi.fn();
  const mockPublish = vi.fn().mockResolvedValue(undefined);
  const mockTx = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      ticketItem: { updateMany: mockUpdateMany },
      ticket: { update: mockTicketUpdate },
      onlineOrderRequest: { update: mockUpdate },
    }),
  );
  return {
    mockFindFirst,
    mockFindMany,
    mockUpdateMany,
    mockTicketUpdate,
    mockUpdate,
    mockTx,
    mockAuditCreate,
    mockPublish,
  };
});

vi.mock('../../../prisma.js', () => ({
  prisma: {
    onlineOrderRequest: { findFirst: mockFindFirst, update: mockUpdate },
    ticketItem: { findMany: mockFindMany, updateMany: mockUpdateMany },
    ticket: { update: mockTicketUpdate },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTx,
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (l: string) => `ticket_updates_${l}`,
  onlineOrdersChannelName: (l: string) => `online_orders_${l}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveRejectOnlineOrder } from './reject-online-order.js';

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
      onlineOrderRequest: { findFirst: mockFindFirst, update: mockUpdate },
      ticketItem: { findMany: mockFindMany, updateMany: mockUpdateMany },
      ticket: { update: mockTicketUpdate },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTx,
    } as unknown as RequestContext['prisma'],
    requestId: 't',
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
  mockFindFirst.mockReset();
  mockFindMany.mockReset();
  mockUpdateMany.mockReset();
  mockTicketUpdate.mockReset();
  mockUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveRejectOnlineOrder', () => {
  it('rejects STAFF (manager+ scope required)', async () => {
    await expect(
      resolveRejectOnlineOrder(
        {},
        { id: 'r-1', rejectReason: 'X' },
        staffCtx(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when request not found', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveRejectOnlineOrder(
        {},
        { id: 'r-1', rejectReason: 'X' },
        managerCtx(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when status not PENDING', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      ticketId: 'tk-1',
      confirmStatus: 'CONFIRMED',
    });
    await expect(
      resolveRejectOnlineOrder(
        {},
        { id: 'r-1', rejectReason: 'X' },
        managerCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('voids items + ticket + flips status to REJECTED', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      ticketId: 'tk-1',
      confirmStatus: 'PENDING',
    });
    mockFindMany.mockResolvedValueOnce([{ id: 'ti-1' }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockTicketUpdate.mockResolvedValueOnce({ id: 'tk-1' });
    mockUpdate.mockResolvedValueOnce({ id: 'r-1' });
    await resolveRejectOnlineOrder(
      {},
      { id: 'r-1', rejectReason: 'kitchen closed' },
      managerCtx(),
    );
    expect(mockTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'VOIDED' }),
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmStatus: 'REJECTED',
          rejectReason: 'kitchen closed',
        }),
      }),
    );
  });
});
