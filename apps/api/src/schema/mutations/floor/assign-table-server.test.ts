import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTableFindFirst,
  mockTableUpdate,
  mockMembershipFindFirst,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTableFindFirst: vi.fn(),
  mockTableUpdate: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    table: { findFirst: mockTableFindFirst, update: mockTableUpdate },
    membership: { findFirst: mockMembershipFindFirst },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveAssignTableServer } from './assign-table-server.js';

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
      table: { findFirst: mockTableFindFirst, update: mockTableUpdate },
      membership: { findFirst: mockMembershipFindFirst },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-9', timezone: 'UTC', currency: 'USD' },
  role: 'MANAGER',
});

beforeEach(() => {
  mockTableFindFirst.mockReset();
  mockTableUpdate.mockReset();
  mockMembershipFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveAssignTableServer', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveAssignTableServer(
        {},
        { tableId: 't-1', assignedServerId: 'u-2' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: { id: 'loc-9', timezone: 'UTC', currency: 'USD' },
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound when server is not a member of this location', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveAssignTableServer(
        {},
        { tableId: 't-1', assignedServerId: 'u-other' },
        managerCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('happy path: assigns and publishes', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockTableUpdate.mockResolvedValueOnce({ id: 't-1' });
    await resolveAssignTableServer(
      {},
      { tableId: 't-1', assignedServerId: 'u-2' },
      managerCtx,
    );
    expect(mockTableUpdate.mock.calls[0]?.[0].data).toEqual({
      assignedServerId: 'u-2',
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'table.server_assigned',
    );
    expect(mockPublish).toHaveBeenCalled();
  });
  it('null assignedServerId clears the assignment without membership check', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockTableUpdate.mockResolvedValueOnce({ id: 't-1' });
    await resolveAssignTableServer(
      {},
      { tableId: 't-1', assignedServerId: null },
      managerCtx,
    );
    expect(mockMembershipFindFirst).not.toHaveBeenCalled();
  });
});
