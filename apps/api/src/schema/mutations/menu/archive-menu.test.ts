import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMenuFindFirst, mockMenuUpdate, mockAuditCreate } = vi.hoisted(() => ({
  mockMenuFindFirst: vi.fn(),
  mockMenuUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menu: { findFirst: mockMenuFindFirst, update: mockMenuUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveArchiveMenu } from './archive-menu.js';

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
      menu: { findFirst: mockMenuFindFirst, update: mockMenuUpdate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuFindFirst.mockReset();
  mockMenuUpdate.mockReset();
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

describe('resolveArchiveMenu', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveArchiveMenu(
        {},
        { id: 'm-1' },
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

  it('NotFound cross-location', async () => {
    mockMenuFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveArchiveMenu({}, { id: 'm-x' }, managerCtx('loc-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy: archives, deactivates, writes audit', async () => {
    mockMenuFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockMenuUpdate.mockResolvedValueOnce({ id: 'm-1' });
    await resolveArchiveMenu({}, { id: 'm-1' }, managerCtx());
    const data = mockMenuUpdate.mock.calls[0]?.[0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(data.isActive).toBe(false);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('menu.archived');
  });
});
