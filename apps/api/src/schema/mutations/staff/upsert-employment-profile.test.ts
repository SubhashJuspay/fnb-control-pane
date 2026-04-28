import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLocationFindFirst,
  mockMembershipFindFirst,
  mockProfileUpsert,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockLocationFindFirst: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
  mockProfileUpsert: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    location: { findFirst: mockLocationFindFirst },
    membership: { findFirst: mockMembershipFindFirst },
    employmentProfile: { upsert: mockProfileUpsert },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { NotFoundError } from '../../../errors.js';
import { resolveUpsertEmploymentProfile } from './upsert-employment-profile.js';

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
      location: { findFirst: mockLocationFindFirst },
      membership: { findFirst: mockMembershipFindFirst },
      employmentProfile: { upsert: mockProfileUpsert },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const adminCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'ADMIN',
});

beforeEach(() => {
  mockLocationFindFirst.mockReset();
  mockMembershipFindFirst.mockReset();
  mockProfileUpsert.mockReset();
  mockAuditCreate.mockReset();
});

const baseInput = {
  userId: '11111111-1111-1111-1111-111111111111',
  locationId: 'loc-1',
  employmentType: 'FULL_TIME' as const,
  hireDate: new Date('2026-01-01T00:00:00Z'),
  hourlyRateCents: 2500,
};

describe('resolveUpsertEmploymentProfile', () => {
  it('rejects when location not in tenant', async () => {
    mockLocationFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpsertEmploymentProfile({}, baseInput, adminCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects when target user not in tenant', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1' });
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpsertEmploymentProfile({}, baseInput, adminCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('upserts profile and audits', async () => {
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'loc-1' });
    mockMembershipFindFirst.mockResolvedValueOnce({ id: 'mem-1' });
    mockProfileUpsert.mockResolvedValueOnce({ id: 'ep-1' });
    await resolveUpsertEmploymentProfile({}, baseInput, adminCtx);
    expect(mockProfileUpsert).toHaveBeenCalled();
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'employment.upserted',
    );
  });
});
