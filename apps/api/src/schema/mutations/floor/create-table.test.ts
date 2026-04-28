import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTableFindFirst,
  mockTableCreate,
  mockSectionFindFirst,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockTableFindFirst: vi.fn(),
  mockTableCreate: vi.fn(),
  mockSectionFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    table: { findFirst: mockTableFindFirst, create: mockTableCreate },
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
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveCreateTable } from './create-table.js';

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
      table: { findFirst: mockTableFindFirst, create: mockTableCreate },
      section: { findFirst: mockSectionFindFirst },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx = (locationId = 'loc-9'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: locationId, timezone: 'UTC', currency: 'USD' },
    role: 'MANAGER',
  });

beforeEach(() => {
  mockTableFindFirst.mockReset();
  mockTableCreate.mockReset();
  mockSectionFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveCreateTable', () => {
  const baseInput = { label: 'T-1', positionX: 0, positionY: 0 };

  it('rejects anonymous', async () => {
    await expect(
      resolveCreateTable({}, baseInput, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects STAFF', async () => {
    await expect(
      resolveCreateTable(
        {},
        baseInput,
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound when sectionId is from another location', async () => {
    mockSectionFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveCreateTable(
        {},
        { ...baseInput, sectionId: 's-other' },
        managerCtx('loc-9'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('Conflict on duplicate label', async () => {
    mockTableFindFirst.mockResolvedValueOnce({ id: 't-old' });
    await expect(
      resolveCreateTable({}, baseInput, managerCtx('loc-9')),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: creates with defaults, audits, publishes', async () => {
    mockTableFindFirst.mockResolvedValueOnce(null);
    mockTableCreate.mockResolvedValueOnce({ id: 't-1' });
    await resolveCreateTable({}, baseInput, managerCtx('loc-9'));
    const data = mockTableCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      locationId: 'loc-9',
      label: 'T-1',
      capacity: 2,
      shape: 'RECT',
      width: 80,
      height: 80,
      rotation: 0,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('table.created');
    expect(mockPublish).toHaveBeenCalledWith('floor_updates_loc-9', {
      kind: 'TableChanged',
      tableId: 't-1',
    });
  });
});
