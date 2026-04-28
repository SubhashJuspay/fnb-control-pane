import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTableFindFirst,
  mockTableUpdate,
  mockSectionFindFirst,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTableFindFirst: vi.fn(),
  mockTableUpdate: vi.fn(),
  mockSectionFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    table: { findFirst: mockTableFindFirst, update: mockTableUpdate },
    section: { findFirst: mockSectionFindFirst },
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
import { resolveUpdateTable } from './update-table.js';

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
      section: { findFirst: mockSectionFindFirst },
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
  mockSectionFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveUpdateTable', () => {
  it('NotFound for cross-location violation', async () => {
    mockTableFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateTable({}, { id: 't-1', label: 'X' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects anonymous', async () => {
    await expect(
      resolveUpdateTable({}, { id: 't-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('happy path: updates only provided fields, audits, publishes', async () => {
    mockTableFindFirst
      .mockResolvedValueOnce({ id: 't-1' }) // existence
      .mockResolvedValueOnce(null); // dup-label check
    mockTableUpdate.mockResolvedValueOnce({ id: 't-1' });
    await resolveUpdateTable(
      {},
      { id: 't-1', label: 'New', positionX: 50, positionY: 60 },
      managerCtx,
    );
    const data = mockTableUpdate.mock.calls[0]?.[0].data;
    expect(data).toEqual({ label: 'New', positionX: 50, positionY: 60 });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('table.updated');
    expect(mockPublish).toHaveBeenCalledWith('floor_updates_loc-9', {
      kind: 'TableChanged',
      tableId: 't-1',
    });
  });
});
