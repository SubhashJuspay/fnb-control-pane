import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMenuFindFirst,
  mockSectionFindFirst,
  mockSectionCreate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockMenuFindFirst: vi.fn(),
  mockSectionFindFirst: vi.fn(),
  mockSectionCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menu: { findFirst: mockMenuFindFirst },
    menuSection: { findFirst: mockSectionFindFirst, create: mockSectionCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveCreateMenuSection } from './create-menu-section.js';

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
      menu: { findFirst: mockMenuFindFirst },
      menuSection: { findFirst: mockSectionFindFirst, create: mockSectionCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuFindFirst.mockReset();
  mockSectionFindFirst.mockReset();
  mockSectionCreate.mockReset();
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

describe('resolveCreateMenuSection', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveCreateMenuSection(
        {},
        { menuId: 'm-1', name: 'Mains' },
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

  it('NotFound when menu belongs to another location', async () => {
    mockMenuFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveCreateMenuSection({}, { menuId: 'm-other', name: 'X' }, managerCtx('loc-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockSectionCreate).not.toHaveBeenCalled();
  });

  it('happy: defaults sortOrder to MAX+1, writes audit', async () => {
    mockMenuFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockSectionFindFirst.mockResolvedValueOnce({ sortOrder: 2 });
    mockSectionCreate.mockResolvedValueOnce({ id: 'sec-1' });
    await resolveCreateMenuSection({}, { menuId: 'm-1', name: 'Mains' }, managerCtx());
    const data = mockSectionCreate.mock.calls[0]?.[0].data;
    expect(data.sortOrder).toBe(3);
    expect(data.menuId).toBe('m-1');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('menu.section.created');
  });
});
