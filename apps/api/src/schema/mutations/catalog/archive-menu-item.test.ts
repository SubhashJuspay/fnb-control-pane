import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMenuItemFindFirst, mockMenuItemUpdate, mockAuditCreate } = vi.hoisted(() => ({
  mockMenuItemFindFirst: vi.fn(),
  mockMenuItemUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuItem: { findFirst: mockMenuItemFindFirst, update: mockMenuItemUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveArchiveMenuItem, resolveUnarchiveMenuItem } from './archive-menu-item.js';

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
      menuItem: { findFirst: mockMenuItemFindFirst, update: mockMenuItemUpdate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuItemFindFirst.mockReset();
  mockMenuItemUpdate.mockReset();
  mockAuditCreate.mockReset();
});

const adminCtx = (tenantId = 't-1') =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: tenantId, slug: 't' },
    location: null,
    role: 'ADMIN',
  });

describe('resolveArchiveMenuItem', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveArchiveMenuItem(
        {},
        { id: 'mi-1' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: null,
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('sets archivedAt and writes audit', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockMenuItemUpdate.mockResolvedValueOnce({ id: 'mi-1' });
    await resolveArchiveMenuItem({}, { id: 'mi-1' }, adminCtx('t-9'));
    const data = mockMenuItemUpdate.mock.calls[0]?.[0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.item.archived');
  });

  it('NotFound for cross-tenant id', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveArchiveMenuItem({}, { id: 'mi-other' }, adminCtx('t-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('resolveUnarchiveMenuItem', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUnarchiveMenuItem(
        {},
        { id: 'mi-1' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: null,
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('clears archivedAt to null and writes audit', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockMenuItemUpdate.mockResolvedValueOnce({ id: 'mi-1' });
    await resolveUnarchiveMenuItem({}, { id: 'mi-1' }, adminCtx('t-9'));
    expect(mockMenuItemUpdate.mock.calls[0]?.[0].data).toEqual({ archivedAt: null });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.item.unarchived');
  });
});
