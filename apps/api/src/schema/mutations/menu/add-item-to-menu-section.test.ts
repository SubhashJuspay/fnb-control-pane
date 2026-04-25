import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSectionFindFirst,
  mockMenuItemFindFirst,
  mockSectionItemFindFirst,
  mockSectionItemCreate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockSectionFindFirst: vi.fn(),
  mockMenuItemFindFirst: vi.fn(),
  mockSectionItemFindFirst: vi.fn(),
  mockSectionItemCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuSection: { findFirst: mockSectionFindFirst },
    menuItem: { findFirst: mockMenuItemFindFirst },
    menuSectionItem: {
      findFirst: mockSectionItemFindFirst,
      create: mockSectionItemCreate,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveAddItemToMenuSection } from './add-item-to-menu-section.js';

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
      menuSection: { findFirst: mockSectionFindFirst },
      menuItem: { findFirst: mockMenuItemFindFirst },
      menuSectionItem: {
        findFirst: mockSectionItemFindFirst,
        create: mockSectionItemCreate,
      },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockSectionFindFirst.mockReset();
  mockMenuItemFindFirst.mockReset();
  mockSectionItemFindFirst.mockReset();
  mockSectionItemCreate.mockReset();
  mockAuditCreate.mockReset();
});

const managerCtx = (
  tenantId = 't-1',
  locationId: string | null = 'loc-1',
): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: tenantId, slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'MANAGER',
  });

describe('resolveAddItemToMenuSection', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveAddItemToMenuSection(
        {},
        { menuSectionId: 's-1', menuItemId: 'mi-1' },
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

  it('NotFound for cross-location section', async () => {
    mockSectionFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveAddItemToMenuSection(
        {},
        { menuSectionId: 's-x', menuItemId: 'mi-1' },
        managerCtx('t-1', 'loc-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('NotFound for cross-tenant menuItem', async () => {
    mockSectionFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveAddItemToMenuSection(
        {},
        { menuSectionId: 's-1', menuItemId: 'mi-other' },
        managerCtx('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockMenuItemFindFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'mi-other',
      tenantId: 't-A',
    });
  });

  it('happy path: defaults sortOrder to MAX+1, writes audit', async () => {
    mockSectionFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockSectionItemFindFirst.mockResolvedValueOnce({ sortOrder: 1 });
    mockSectionItemCreate.mockResolvedValueOnce({ id: 'msi-1' });
    await resolveAddItemToMenuSection(
      {},
      { menuSectionId: 's-1', menuItemId: 'mi-1', priceOverrideCents: 199 },
      managerCtx(),
    );
    const data = mockSectionItemCreate.mock.calls[0]?.[0].data;
    expect(data.sortOrder).toBe(2);
    expect(data.priceOverrideCents).toBe(199);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'menu.section.item_added',
    );
  });

  it('translates P2002 into ConflictError', async () => {
    mockSectionFindFirst.mockResolvedValueOnce({ id: 's-1' });
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockSectionItemFindFirst.mockResolvedValueOnce(null);
    mockSectionItemCreate.mockRejectedValueOnce(
      Object.assign(new Error('unique violation'), { code: 'P2002' }),
    );
    await expect(
      resolveAddItemToMenuSection(
        {},
        { menuSectionId: 's-1', menuItemId: 'mi-1' },
        managerCtx(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
