import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext, RequestContext } from '../context.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { openTicketBoundToTable } from './open-ticket.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

function makeMocks() {
  const mockTableFindFirst = vi.fn();
  const mockTicketFindFirst = vi.fn();
  const mockLocationFindUnique = vi.fn();
  const mockTicketAggregate = vi.fn();
  const mockTicketCreate = vi.fn();
  const prisma = {
    table: { findFirst: mockTableFindFirst },
    ticket: {
      findFirst: mockTicketFindFirst,
      aggregate: mockTicketAggregate,
      create: mockTicketCreate,
    },
    location: { findUnique: mockLocationFindUnique },
  } as unknown as RequestContext['prisma'];
  return {
    prisma,
    mockTableFindFirst,
    mockTicketFindFirst,
    mockLocationFindUnique,
    mockTicketAggregate,
    mockTicketCreate,
  };
}

function ctxFor(auth: AuthContext, prisma: RequestContext['prisma']): RequestContext {
  return { auth, prisma, requestId: 'test', log: fakeLog };
}

const staffAuth: AuthContext = {
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-9', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'STAFF',
};

describe('openTicketBoundToTable', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => {
    m = makeMocks();
  });

  it('NotFound when table missing', async () => {
    m.mockTableFindFirst.mockResolvedValueOnce(null);
    await expect(
      openTicketBoundToTable({
        prisma: m.prisma,
        ctx: ctxFor(staffAuth, m.prisma),
        tableId: 't-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('ConflictError when an OPEN ticket already exists', async () => {
    m.mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    m.mockTicketFindFirst.mockResolvedValueOnce({ id: 'tk-existing' });
    await expect(
      openTicketBoundToTable({
        prisma: m.prisma,
        ctx: ctxFor(staffAuth, m.prisma),
        tableId: 't-1',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path: returns ticketId, shortNumber, businessDay, locationId', async () => {
    m.mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    m.mockTicketFindFirst.mockResolvedValueOnce(null);
    m.mockLocationFindUnique.mockResolvedValueOnce({
      businessDayCutoff: '04:00',
      timezone: 'America/Los_Angeles',
    });
    m.mockTicketAggregate.mockResolvedValueOnce({ _max: { shortNumber: 0 } });
    m.mockTicketCreate.mockResolvedValueOnce({
      id: 'tk-1',
      shortNumber: 1,
      businessDay: new Date('2026-04-28T00:00:00Z'),
    });
    const result = await openTicketBoundToTable({
      prisma: m.prisma,
      ctx: ctxFor(staffAuth, m.prisma),
      tableId: 't-1',
      customerLabel: 'Sarah',
    });
    expect(result).toEqual({
      ticketId: 'tk-1',
      shortNumber: 1,
      businessDay: new Date('2026-04-28T00:00:00Z'),
      locationId: 'loc-9',
    });
    const data = m.mockTicketCreate.mock.calls[0]?.[0].data;
    expect(data.tableId).toBe('t-1');
    expect(data.locationId).toBe('loc-9');
    expect(data.orderType).toBe('DINE_IN');
  });

  it('retries on P2002 unique violation', async () => {
    m.mockTableFindFirst.mockResolvedValueOnce({ id: 't-1' });
    m.mockTicketFindFirst.mockResolvedValueOnce(null);
    m.mockLocationFindUnique.mockResolvedValueOnce({
      businessDayCutoff: '04:00',
      timezone: 'America/Los_Angeles',
    });
    m.mockTicketAggregate
      .mockResolvedValueOnce({ _max: { shortNumber: 0 } })
      .mockResolvedValueOnce({ _max: { shortNumber: 1 } });
    const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
    m.mockTicketCreate
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({
        id: 'tk-1',
        shortNumber: 2,
        businessDay: new Date('2026-04-28T00:00:00Z'),
      });
    const result = await openTicketBoundToTable({
      prisma: m.prisma,
      ctx: ctxFor(staffAuth, m.prisma),
      tableId: 't-1',
    });
    expect(result.shortNumber).toBe(2);
    expect(m.mockTicketCreate).toHaveBeenCalledTimes(2);
  });
});
