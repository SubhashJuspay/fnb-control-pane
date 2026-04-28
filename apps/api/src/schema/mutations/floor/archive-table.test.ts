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
import { resolveArchiveTable } from './archive-table.js';

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
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveArchiveTable', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveArchiveTable({}, { id: 't-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound for cross-location violation', async () => {
    mockTableFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveArchiveTable({}, { id: 't-1' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('happy path', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockTableUpdate.mockResolvedValueOnce({ id: 't-1' });
    await resolveArchiveTable({}, { id: 't-1' }, managerCtx);
    expect(mockTableUpdate.mock.calls[0]?.[0].data.archivedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('table.archived');
    expect(mockPublish).toHaveBeenCalled();
  });
});
