import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSectionFindMany,
  mockSectionUpdate,
  mockAuditCreate,
  mockPublish,
  mockTransaction,
} = vi.hoisted(() => ({
  mockSectionFindMany: vi.fn(),
  mockSectionUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
  mockTransaction: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    section: { findMany: mockSectionFindMany, update: mockSectionUpdate },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveReorderSections } from './reorder-sections.js';

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
      section: { findMany: mockSectionFindMany, update: mockSectionUpdate },
      auditLog: { create: mockAuditCreate },
      $transaction: mockTransaction,
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
  mockSectionFindMany.mockReset();
  mockSectionUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
  mockTransaction.mockReset();
  mockTransaction.mockResolvedValue([]);
});

describe('resolveReorderSections', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveReorderSections({ orderedIds: ['s-1'] }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound when not all sections in viewer location', async () => {
    mockSectionFindMany.mockResolvedValueOnce([{ id: 's-1' }]); // missing s-2
    await expect(
      resolveReorderSections({ orderedIds: ['s-1', 's-2'] }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('happy path: scopes sections to viewer location, publishes per id', async () => {
    mockSectionFindMany
      .mockResolvedValueOnce([{ id: 's-1' }, { id: 's-2' }])
      .mockResolvedValueOnce([{ id: 's-1', sortOrder: 0 }, { id: 's-2', sortOrder: 1 }]);
    await resolveReorderSections({ orderedIds: ['s-1', 's-2'] }, managerCtx);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('section.reordered');
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish.mock.calls[0]?.[0]).toBe('floor_updates_loc-9');
  });
});
