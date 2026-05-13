import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindFirst,
  mockFindUnique,
  mockFindMany,
  mockUpdateMany,
  mockUpdate,
  mockTx,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => {
  const mockFindFirst = vi.fn();
  const mockFindUnique = vi.fn().mockResolvedValue(null);
  const mockFindMany = vi.fn();
  const mockUpdateMany = vi.fn();
  const mockUpdate = vi.fn();
  const mockAuditCreate = vi.fn();
  const mockPublish = vi.fn().mockResolvedValue(undefined);
  const mockTx = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      ticketItem: { updateMany: mockUpdateMany },
      onlineOrderRequest: { update: mockUpdate },
    }),
  );
  return {
    mockFindFirst,
    mockFindUnique,
    mockFindMany,
    mockUpdateMany,
    mockUpdate,
    mockTx,
    mockAuditCreate,
    mockPublish,
  };
});

vi.mock('../../../prisma.js', () => ({
  prisma: {
    onlineOrderRequest: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    ticketItem: { findMany: mockFindMany, updateMany: mockUpdateMany },
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
import { resolveConfirmOnlineOrder } from './confirm-online-order.js';

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
      onlineOrderRequest: {
        findFirst: mockFindFirst,
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
      ticketItem: { findMany: mockFindMany, updateMany: mockUpdateMany },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTx,
    } as unknown as RequestContext['prisma'],
    requestId: 't',
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
  mockFindFirst.mockReset();
  mockFindMany.mockReset();
  mockUpdateMany.mockReset();
  mockUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  // Default: no email/SMS context loaded (no customer email on the request).
  // Suppresses the post-confirm notification side-effects so existing tests
  // don't need to mock the entire row shape.
  mockFindUnique.mockReset();
  mockFindUnique.mockResolvedValue(null);
});

describe('resolveConfirmOnlineOrder', () => {
  it('rejects anonymous callers', async () => {
    await expect(
      resolveConfirmOnlineOrder({}, { id: 'r-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when request not found', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveConfirmOnlineOrder({}, { id: 'r-1' }, staffCtx()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when request not PENDING', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      ticketId: 'tk-1',
      confirmStatus: 'CONFIRMED',
    });
    await expect(
      resolveConfirmOnlineOrder({}, { id: 'r-1' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('fires NEW items + flips status to CONFIRMED + publishes events', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      ticketId: 'tk-1',
      confirmStatus: 'PENDING',
    });
    mockFindMany.mockResolvedValueOnce([{ id: 'ti-1' }, { id: 'ti-2' }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });
    mockUpdate.mockResolvedValueOnce({ id: 'r-1' });
    await resolveConfirmOnlineOrder({}, { id: 'r-1' }, staffCtx());
    expect(mockUpdateMany).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confirmStatus: 'CONFIRMED' }),
      }),
    );
    const channels = mockPublish.mock.calls.map((c) => c[0]);
    expect(channels).toContain('online_orders_loc-1');
    expect(channels).toContain('ticket_updates_loc-1');
  });
});
