import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGuestFindFirst,
  mockGuestUpdate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockGuestFindFirst: vi.fn(),
  mockGuestUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    guest: { findFirst: mockGuestFindFirst, update: mockGuestUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveUpdateGuest } from './update-guest.js';

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
      guest: { findFirst: mockGuestFindFirst, update: mockGuestUpdate },
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
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'MANAGER',
});

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockGuestFindFirst.mockReset();
  mockGuestUpdate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveUpdateGuest', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateGuest({}, { id: 'g-1' }, staffCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('NotFound when guest is in another tenant', async () => {
    mockGuestFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateGuest({}, { id: 'g-1', name: 'Alice' }, managerCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('manager: only writes provided fields', async () => {
    mockGuestFindFirst.mockResolvedValueOnce({ id: 'g-1' });
    mockGuestUpdate.mockResolvedValueOnce({ id: 'g-1' });
    await resolveUpdateGuest(
      {},
      { id: 'g-1', name: 'Alice', phone: null },
      managerCtx,
    );
    const data = mockGuestUpdate.mock.calls[0]?.[0].data;
    expect(data.name).toBe('Alice');
    expect(data.phone).toBe(null);
    expect(data).not.toHaveProperty('email');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('guest.updated');
  });
});
