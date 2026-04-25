import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSectionFindFirst, mockSectionUpdate, mockAuditCreate } = vi.hoisted(() => ({
  mockSectionFindFirst: vi.fn(),
  mockSectionUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuSection: { findFirst: mockSectionFindFirst, update: mockSectionUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveUpdateMenuSection } from './update-menu-section.js';

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
      menuSection: { findFirst: mockSectionFindFirst, update: mockSectionUpdate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockSectionFindFirst.mockReset();
  mockSectionUpdate.mockReset();
  mockAuditCreate.mockReset();
});

const managerCtx = (locationId = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'MANAGER',
  });

describe('resolveUpdateMenuSection', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateMenuSection(
        {},
        { id: 's-1' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('NotFound when section belongs to another location', async () => {
    mockSectionFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateMenuSection({}, { id: 's-other' }, managerCtx('loc-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
    const where = mockSectionFindFirst.mock.calls[0]?.[0].where;
    expect(where).toEqual({ id: 's-other', menu: { locationId: 'loc-A' } });
  });

  it('happy: updates name, writes audit', async () => {
    mockSectionFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockSectionUpdate.mockResolvedValueOnce({ id: 's-1' });
    await resolveUpdateMenuSection({}, { id: 's-1', name: 'Renamed' }, managerCtx());
    expect(mockSectionUpdate.mock.calls[0]?.[0].data).toEqual({ name: 'Renamed' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('menu.section.updated');
  });
});
