import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLocationFindFirst, mockLocationCreate, mockAuditCreate } = vi.hoisted(() => ({
  mockLocationFindFirst: vi.fn(),
  mockLocationCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  prisma: {
    location: { findFirst: mockLocationFindFirst, create: mockLocationCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../context.js';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { resolveCreateLocation } from './create-location.js';

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
      location: { findFirst: mockLocationFindFirst, create: mockLocationCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockLocationFindFirst.mockReset();
  mockLocationCreate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveCreateLocation', () => {
  it('throws ForbiddenError for anonymous viewers', async () => {
    await expect(
      resolveCreateLocation(
        {},
        { name: 'A', slug: 'a', timezone: 'UTC', currency: 'USD' },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for STAFF role', async () => {
    await expect(
      resolveCreateLocation(
        {},
        { name: 'A', slug: 'a', timezone: 'UTC', currency: 'USD' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: null,
          role: 'STAFF',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockLocationCreate).not.toHaveBeenCalled();
  });

  it('throws ConflictError when slug already exists in tenant', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(
      resolveCreateLocation(
        {},
        { name: 'A', slug: 'a', timezone: 'UTC', currency: 'USD' },
        ctxFor({
          kind: 'authenticated',
          user: { id: 'u-1', email: 'u@t' },
          tenant: { id: 't-1', slug: 't' },
          location: null,
          role: 'OWNER',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockLocationCreate).not.toHaveBeenCalled();
  });

  it('creates location, applies defaults, writes audit log on success', async () => {
    mockLocationFindFirst.mockResolvedValueOnce(null);
    mockLocationCreate.mockResolvedValueOnce({ id: 'l-new' });
    mockAuditCreate.mockResolvedValueOnce({ id: 'a-1' });
    const result = await resolveCreateLocation(
      {},
      { name: 'New', slug: 'new', timezone: 'UTC', currency: 'USD' },
      ctxFor({
        kind: 'authenticated',
        user: { id: 'u-1', email: 'u@t' },
        tenant: { id: 't-99', slug: 't' },
        location: null,
        role: 'ADMIN',
      }),
    );
    expect(result).toEqual({ id: 'l-new' });
    const createCall = mockLocationCreate.mock.calls[0]?.[0];
    expect(createCall.data).toEqual({
      tenantId: 't-99',
      name: 'New',
      slug: 'new',
      timezone: 'UTC',
      currency: 'USD',
      locale: 'en-US',
      businessDayCutoff: '04:00',
    });
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const audit = mockAuditCreate.mock.calls[0]?.[0];
    expect(audit.data).toMatchObject({
      tenantId: 't-99',
      actorUserId: 'u-1',
      action: 'location.created',
      resourceType: 'location',
      resourceId: 'l-new',
    });
  });
});
