import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSectionFindFirst,
  mockSectionCreate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockSectionFindFirst: vi.fn(),
  mockSectionCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    section: { findFirst: mockSectionFindFirst, create: mockSectionCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { resolveCreateSection } from './create-section.js';

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
      section: { findFirst: mockSectionFindFirst, create: mockSectionCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const managerCtx = (locationId: string | null = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'MANAGER',
  });

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockSectionFindFirst.mockReset();
  mockSectionCreate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveCreateSection', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveCreateSection({}, { name: 'Patio' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects STAFF role', async () => {
    await expect(
      resolveCreateSection({}, { name: 'Patio' }, staffCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects when no location', async () => {
    await expect(
      resolveCreateSection({}, { name: 'Patio' }, managerCtx(null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects duplicate name', async () => {
    mockSectionFindFirst.mockResolvedValueOnce({ id: 's-old' });
    await expect(
      resolveCreateSection({}, { name: 'Patio' }, managerCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: scopes to viewer location, audits, publishes', async () => {
    mockSectionFindFirst.mockResolvedValueOnce(null);
    mockSectionCreate.mockResolvedValueOnce({ id: 's-1' });
    await resolveCreateSection({}, { name: 'Patio' }, managerCtx('loc-9'));
    expect(mockSectionCreate.mock.calls[0]?.[0].data).toMatchObject({
      locationId: 'loc-9',
      name: 'Patio',
      sortOrder: 0,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('section.created');
    expect(mockPublish).toHaveBeenCalledWith('floor_updates_loc-9', {
      kind: 'SectionChanged',
      sectionId: 's-1',
    });
  });
});
