import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockProfileFindFirst, mockProfileUpdate, mockAuditCreate } = vi.hoisted(
  () => ({
    mockProfileFindFirst: vi.fn(),
    mockProfileUpdate: vi.fn(),
    mockAuditCreate: vi.fn(),
  }),
);

vi.mock('../../../prisma.js', () => ({
  prisma: {
    employmentProfile: {
      findFirst: mockProfileFindFirst,
      update: mockProfileUpdate,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { NotFoundError } from '../../../errors.js';
import { resolveEndEmployment } from './end-employment.js';

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
      employmentProfile: {
        findFirst: mockProfileFindFirst,
        update: mockProfileUpdate,
      },
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
  mockProfileFindFirst.mockReset();
  mockProfileUpdate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveEndEmployment', () => {
  it('rejects when profile not found', async () => {
    mockProfileFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveEndEmployment(
        {},
        { id: 'ep-1', terminationDate: new Date('2026-04-30T00:00:00Z') },
        adminCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('sets terminationDate and audits', async () => {
    mockProfileFindFirst.mockResolvedValueOnce({ id: 'ep-1' });
    mockProfileUpdate.mockResolvedValueOnce({ id: 'ep-1' });
    const date = new Date('2026-04-30T00:00:00Z');
    await resolveEndEmployment({}, { id: 'ep-1', terminationDate: date }, adminCtx);
    expect(mockProfileUpdate.mock.calls[0]?.[0].data).toEqual({
      terminationDate: date,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'employment.ended',
    );
  });
});
