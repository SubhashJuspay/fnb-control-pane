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
import { resolveUpdateMenu } from './update-menu.js';

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

describe('resolveUpdateMenu', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateMenu(
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

  it('rejects when no location', async () => {
    await expect(
      resolveUpdateMenu({}, { id: 'm-1' }, managerCtx(null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('NotFound for cross-location id', async () => {
    mockMenuFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateMenu({}, { id: 'm-other' }, managerCtx('loc-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockMenuFindFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'm-other',
      locationId: 'loc-A',
    });
  });

  it('happy: only updates fields present in input, writes audit', async () => {
    mockMenuFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockMenuUpdate.mockResolvedValueOnce({ id: 'm-1' });
    await resolveUpdateMenu(
      {},
      { id: 'm-1', name: 'New name' },
      managerCtx(),
    );
    const data = mockMenuUpdate.mock.calls[0]?.[0].data;
    expect(data).toEqual({ name: 'New name' });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('menu.updated');
  });
});
