import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTaxCategoryFindFirst, mockTaxCategoryCreate, mockAuditCreate } = vi.hoisted(
  () => ({
    mockTaxCategoryFindFirst: vi.fn(),
    mockTaxCategoryCreate: vi.fn(),
    mockAuditCreate: vi.fn(),
  }),
);

vi.mock('../../../prisma.js', () => ({
  prisma: {
    taxCategory: {
      findFirst: mockTaxCategoryFindFirst,
      create: mockTaxCategoryCreate,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { resolveCreateTaxCategory } from './create-tax-category.js';

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
      taxCategory: {
        findFirst: mockTaxCategoryFindFirst,
        create: mockTaxCategoryCreate,
      },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockTaxCategoryFindFirst.mockReset();
  mockTaxCategoryCreate.mockReset();
  mockAuditCreate.mockReset();
});

const admin = (tid = 't-1') =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: tid, slug: 't' },
    location: null,
    role: 'ADMIN',
  });

describe('resolveCreateTaxCategory', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveCreateTaxCategory(
        {},
        { name: 'Food', kind: 'FOOD' },
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

  it('happy path creates tax category and writes audit', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce(null);
    mockTaxCategoryCreate.mockResolvedValueOnce({ id: 'tc-1' });
    const result = await resolveCreateTaxCategory(
      {},
      { name: 'Food', kind: 'FOOD' },
      admin('t-9'),
    );
    expect(result).toEqual({ id: 'tc-1' });
    expect(mockTaxCategoryCreate.mock.calls[0]?.[0].data).toEqual({
      tenantId: 't-9',
      name: 'Food',
      kind: 'FOOD',
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'catalog.tax_category.created',
    );
  });

  it('throws ConflictError on duplicate (tenantId, kind)', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce({ id: 'tc-existing' });
    await expect(
      resolveCreateTaxCategory({}, { name: 'Food', kind: 'FOOD' }, admin()),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockTaxCategoryCreate).not.toHaveBeenCalled();
  });

  it('handles P2002 unique violation race fallback as Conflict', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce(null);
    mockTaxCategoryCreate.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    );
    await expect(
      resolveCreateTaxCategory({}, { name: 'Food', kind: 'FOOD' }, admin()),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
