import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTableFindFirst,
  mockTableUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTableFindFirst: vi.fn(),
  mockTableUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    table: { findFirst: mockTableFindFirst, update: mockTableUpdate },
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
import { resolveSetTableManualState } from './set-table-manual-state.js';

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
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-9', timezone: 'UTC', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockTableFindFirst.mockReset();
  mockTableUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveSetTableManualState', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveSetTableManualState(
        {},
        { tableId: 't-1', manualState: 'CLEANING' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound for cross-location', async () => {
    mockTableFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveSetTableManualState(
        {},
        { tableId: 't-1', manualState: 'CLEANING' },
        staffCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('staff can set; happy path', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockTableUpdate.mockResolvedValueOnce({ id: 't-1' });
    await resolveSetTableManualState(
      {},
      { tableId: 't-1', manualState: 'CLEANING' },
      staffCtx,
    );
    expect(mockTableUpdate.mock.calls[0]?.[0].data).toEqual({
      manualState: 'CLEANING',
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'table.manual_state_set',
    );
    expect(mockPublish).toHaveBeenCalled();
  });
});
