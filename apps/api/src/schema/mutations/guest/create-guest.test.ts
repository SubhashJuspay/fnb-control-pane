import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGuestCreate, mockAuditCreate } = vi.hoisted(() => ({
  mockGuestCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    guest: { create: mockGuestCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { resolveCreateGuest } from './create-guest.js';

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
      guest: { create: mockGuestCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'STAFF',
});

const viewerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'VIEWER',
});

beforeEach(() => {
  mockGuestCreate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveCreateGuest', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveCreateGuest({}, { name: 'A' }, ctxFor({ kind: 'anonymous' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects VIEWER', async () => {
    await expect(
      resolveCreateGuest({}, { name: 'A' }, viewerCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('staff: creates with tenant scope and writes audit', async () => {
    mockGuestCreate.mockResolvedValueOnce({ id: 'g-1' });
    await resolveCreateGuest(
      {},
      { name: 'Alice', phone: '555-0100' },
      staffCtx,
    );
    const data = mockGuestCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      tenantId: 't-1',
      name: 'Alice',
      phone: '555-0100',
      email: null,
      notes: null,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('guest.created');
  });
});
