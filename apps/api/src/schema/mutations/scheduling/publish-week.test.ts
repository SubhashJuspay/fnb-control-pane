import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLocationFindFirst,
  mockShiftFindMany,
  mockShiftUpdateMany,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockLocationFindFirst: vi.fn(),
  mockShiftFindMany: vi.fn(),
  mockShiftUpdateMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    location: { findFirst: mockLocationFindFirst },
    shift: { findMany: mockShiftFindMany, updateMany: mockShiftUpdateMany },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
  scheduleChannelName: (id: string) => `schedule_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { NotFoundError } from '../../../errors.js';
import { resolvePublishWeek } from './publish-week.js';

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
      location: { findFirst: mockLocationFindFirst },
      shift: { findMany: mockShiftFindMany, updateMany: mockShiftUpdateMany },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-mgr', email: 'm@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'MANAGER',
});

beforeEach(() => {
  mockLocationFindFirst.mockReset();
  mockShiftFindMany.mockReset();
  mockShiftUpdateMany.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolvePublishWeek', () => {
  it('rejects when location not in tenant', async () => {
    mockLocationFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolvePublishWeek(
        { locationId: 'loc-1', weekStart: new Date('2026-04-27T00:00:00Z') },
        managerCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('publishes 0 when no DRAFT shifts (still audits)', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1', timezone: 'UTC' });
    mockShiftFindMany.mockResolvedValueOnce([]);
    const out = await resolvePublishWeek(
      { locationId: 'loc-1', weekStart: new Date('2026-04-27T00:00:00Z') },
      managerCtx,
    );
    expect(out).toEqual([]);
    expect(mockShiftUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'schedule.week_published',
    );
  });
  it('bulk publishes DRAFT shifts and emits per-shift events', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1', timezone: 'UTC' });
    mockShiftFindMany
      .mockResolvedValueOnce([{ id: 's-1' }, { id: 's-2' }])
      .mockResolvedValueOnce([{ id: 's-1' }, { id: 's-2' }]);
    mockShiftUpdateMany.mockResolvedValueOnce({ count: 2 });
    await resolvePublishWeek(
      { locationId: 'loc-1', weekStart: new Date('2026-04-27T00:00:00Z') },
      managerCtx,
    );
    expect(mockShiftUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s-1', 's-2'] } },
      data: { status: 'PUBLISHED' },
    });
    expect(mockPublish).toHaveBeenCalledTimes(2);
  });
});
