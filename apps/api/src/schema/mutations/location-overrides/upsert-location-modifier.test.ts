import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockModifierFindFirst, mockUpsert, mockAuditCreate } = vi.hoisted(() => ({
  mockModifierFindFirst: vi.fn(),
  mockUpsert: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    modifier: { findFirst: mockModifierFindFirst },
    locationModifier: { upsert: mockUpsert },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveUpsertLocationModifier } from './upsert-location-modifier.js';

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
      modifier: { findFirst: mockModifierFindFirst },
      locationModifier: { upsert: mockUpsert },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockModifierFindFirst.mockReset();
  mockUpsert.mockReset();
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

describe('resolveUpsertLocationModifier', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpsertLocationModifier(
        {},
        { modifierId: 'm-1' },
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
      resolveUpsertLocationModifier({}, { modifierId: 'm-1' }, managerCtx('t-1', null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant: rejects if modifier belongs to another tenant', async () => {
    mockModifierFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpsertLocationModifier(
        {},
        { modifierId: 'm-other' },
        managerCtx('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy: upserts with provided fields, writes audit', async () => {
    mockModifierFindFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockUpsert.mockResolvedValueOnce({ id: 'lm-1' });
    await resolveUpsertLocationModifier(
      {},
      { modifierId: 'm-1', priceDeltaOverrideCents: 50 },
      managerCtx(),
      new Set(['modifierId', 'priceDeltaOverrideCents']),
    );
    const args = mockUpsert.mock.calls[0]?.[0];
    expect(args.create.priceDeltaOverrideCents).toBe(50);
    expect(args.update.priceDeltaOverrideCents).toBe(50);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'location.modifier.override_set',
    );
  });
});
