import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMenuFindFirst, mockMenuCreate, mockAuditCreate } = vi.hoisted(() => ({
  mockMenuFindFirst: vi.fn(),
  mockMenuCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menu: { findFirst: mockMenuFindFirst, create: mockMenuCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { resolveCreateMenu } from './create-menu.js';

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
      menu: { findFirst: mockMenuFindFirst, create: mockMenuCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuFindFirst.mockReset();
  mockMenuCreate.mockReset();
  mockAuditCreate.mockReset();
});

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

describe('resolveCreateMenu', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveCreateMenu({}, { name: 'Brunch' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects STAFF', async () => {
    await expect(
      resolveCreateMenu(
        {},
        { name: 'Brunch' },
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

  it('rejects when no location context', async () => {
    await expect(
      resolveCreateMenu({}, { name: 'Brunch' }, managerCtx(null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('happy path: defaults sortOrder to MAX+1, schedule to always, writes audit', async () => {
    mockMenuFindFirst.mockResolvedValueOnce({ sortOrder: 4 });
    mockMenuCreate.mockResolvedValueOnce({ id: 'menu-1' });
    await resolveCreateMenu({}, { name: 'Brunch' }, managerCtx('loc-9'));
    const data = mockMenuCreate.mock.calls[0]?.[0].data;
    expect(data.sortOrder).toBe(5);
    expect(data.schedule).toEqual({ kind: 'always' });
    expect(data.locationId).toBe('loc-9');
    expect(data.isActive).toBe(true);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('menu.created');
  });

  it('first menu in location starts at sortOrder 0', async () => {
    mockMenuFindFirst.mockResolvedValueOnce(null);
    mockMenuCreate.mockResolvedValueOnce({ id: 'menu-1' });
    await resolveCreateMenu({}, { name: 'Brunch' }, managerCtx());
    expect(mockMenuCreate.mock.calls[0]?.[0].data.sortOrder).toBe(0);
  });
});
