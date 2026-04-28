import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTableFindFirst,
  mockTicketFindFirst,
  mockTicketCreate,
  mockTicketAggregate,
  mockTicketFindUniqueOrThrow,
  mockLocationFindUnique,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTableFindFirst: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCreate: vi.fn(),
  mockTicketAggregate: vi.fn(),
  mockTicketFindUniqueOrThrow: vi.fn(),
  mockLocationFindUnique: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    table: { findFirst: mockTableFindFirst },
    ticket: {
      findFirst: mockTicketFindFirst,
      create: mockTicketCreate,
      aggregate: mockTicketAggregate,
      findUniqueOrThrow: mockTicketFindUniqueOrThrow,
    },
    location: { findUnique: mockLocationFindUnique },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveOpenTicketAtTable } from './open-ticket-at-table.js';

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
      table: { findFirst: mockTableFindFirst },
      ticket: {
        findFirst: mockTicketFindFirst,
        create: mockTicketCreate,
        aggregate: mockTicketAggregate,
        findUniqueOrThrow: mockTicketFindUniqueOrThrow,
      },
      location: { findUnique: mockLocationFindUnique },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (locationId = 'loc-9'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'STAFF',
  });

beforeEach(() => {
  mockTableFindFirst.mockReset();
  mockTicketFindFirst.mockReset();
  mockTicketCreate.mockReset();
  mockTicketAggregate.mockReset();
  mockTicketFindUniqueOrThrow.mockReset();
  mockLocationFindUnique.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveOpenTicketAtTable', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveOpenTicketAtTable({}, { tableId: 't-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound for cross-location table', async () => {
    mockTableFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveOpenTicketAtTable({}, { tableId: 't-1' }, staffCtx()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('Conflict when an open ticket already exists', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-existing' });
    await expect(
      resolveOpenTicketAtTable({}, { tableId: 't-1' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: opens ticket bound to table, audits, publishes both channels', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    mockTicketFindFirst.mockResolvedValueOnce(null);
    mockLocationFindUnique.mockResolvedValueOnce({
      businessDayCutoff: '04:00',
      timezone: 'America/Los_Angeles',
    });
    mockTicketAggregate.mockResolvedValueOnce({ _max: { shortNumber: 0 } });
    mockTicketCreate.mockResolvedValueOnce({
      id: 'tk-1',
      shortNumber: 1,
      businessDay: new Date('2026-04-28T00:00:00Z'),
    });
    mockTicketFindUniqueOrThrow.mockResolvedValueOnce({ id: 'tk-1' });
    await resolveOpenTicketAtTable(
      {},
      { tableId: 't-1', customerLabel: 'Sarah' },
      staffCtx('loc-9'),
    );
    const data = mockTicketCreate.mock.calls[0]?.[0].data;
    expect(data.tableId).toBe('t-1');
    expect(data.locationId).toBe('loc-9');
    expect(data.orderType).toBe('DINE_IN');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('ticket.opened_at_table');
    const channels = mockPublish.mock.calls.map((c) => c[0]);
    expect(channels).toContain('ticket_updates_loc-9');
    expect(channels).toContain('floor_updates_loc-9');
  });
});
