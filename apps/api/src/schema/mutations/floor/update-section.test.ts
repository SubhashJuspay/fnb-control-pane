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
import { resolveUpdateSection } from './update-section.js';

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

const managerCtx = (locationId = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'MANAGER',
  });

beforeEach(() => {
  mockSectionFindFirst.mockReset();
  mockSectionUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveUpdateSection', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveUpdateSection({}, { id: 's-1' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('NotFound when section is at a different location', async () => {
    mockSectionFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateSection({}, { id: 's-1', name: 'X' }, managerCtx('loc-1')),
    ).rejects.toBeInstanceOf(NotFoundError);
    const call = mockSectionFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: 's-1', locationId: 'loc-1' });
  });
  it('happy path: updates and publishes', async () => {
    mockSectionFindFirst
      .mockResolvedValueOnce({ id: 's-1' }) // existence
      .mockResolvedValueOnce(null); // dup-name check
    mockSectionUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveUpdateSection({}, { id: 's-1', name: 'Bar' }, managerCtx('loc-9'));
    expect(mockSectionUpdate.mock.calls[0]?.[0].data).toEqual({ name: 'Bar' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('section.updated');
    expect(mockPublish).toHaveBeenCalledWith('floor_updates_loc-9', {
      kind: 'SectionChanged',
      sectionId: 's-1',
    });
  });
});
