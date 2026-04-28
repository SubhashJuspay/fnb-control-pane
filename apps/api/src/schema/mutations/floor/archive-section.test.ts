import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSectionFindFirst,
  mockSectionUpdate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockSectionFindFirst: vi.fn(),
  mockSectionUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    section: { findFirst: mockSectionFindFirst, update: mockSectionUpdate },
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
import { resolveArchiveSection } from './archive-section.js';

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
      section: { findFirst: mockSectionFindFirst, update: mockSectionUpdate },
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
  location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'MANAGER',
});

beforeEach(() => {
  mockSectionFindFirst.mockReset();
  mockSectionUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveArchiveSection', () => {
  it('rejects STAFF role', async () => {
    await expect(
      resolveArchiveSection(
        {},
        { id: 's-1' },
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
  it('NotFound for cross-location violation', async () => {
    mockSectionFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveArchiveSection({}, { id: 's-1' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('happy path: archives and publishes', async () => {
    mockSectionFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockSectionUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveArchiveSection({}, { id: 's-1' }, managerCtx);
    const data = mockSectionUpdate.mock.calls[0]?.[0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('section.archived');
    expect(mockPublish).toHaveBeenCalled();
  });
});
