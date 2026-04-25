import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTaxCategoryFindFirst,
  mockLocationFindFirst,
  mockTaxRateFindFirst,
  mockTaxRateUpdate,
  mockTaxRateCreate,
  mockAuditCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockTaxCategoryFindFirst: vi.fn(),
  mockLocationFindFirst: vi.fn(),
  mockTaxRateFindFirst: vi.fn(),
  mockTaxRateUpdate: vi.fn(),
  mockTaxRateCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    taxCategory: { findFirst: mockTaxCategoryFindFirst },
    location: { findFirst: mockLocationFindFirst },
    taxRate: {
      findFirst: mockTaxRateFindFirst,
      update: mockTaxRateUpdate,
      create: mockTaxRateCreate,
    },
    auditLog: { create: mockAuditCreate },
    $transaction: mockTransaction,
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveSetTaxRate } from './set-tax-rate.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

// `tx` mirrors the fields used inside the resolver's $transaction callback.
const tx = {
  taxCategory: { findFirst: mockTaxCategoryFindFirst },
  location: { findFirst: mockLocationFindFirst },
  taxRate: {
    findFirst: mockTaxRateFindFirst,
    update: mockTaxRateUpdate,
    create: mockTaxRateCreate,
  },
  auditLog: { create: mockAuditCreate },
};

function ctxFor(auth: AuthContext): RequestContext {
  return {
    auth,
    prisma: {
      ...tx,
      $transaction: mockTransaction,
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockTaxCategoryFindFirst.mockReset();
  mockLocationFindFirst.mockReset();
  mockTaxRateFindFirst.mockReset();
  mockTaxRateUpdate.mockReset();
  mockTaxRateCreate.mockReset();
  mockAuditCreate.mockReset();
  mockTransaction.mockReset();
  // Default behavior: $transaction(callback) invokes the callback with `tx`.
  mockTransaction.mockImplementation(async (cb: (t: typeof tx) => unknown) =>
    cb(tx),
  );
});

const admin = (tid = 't-1') =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: tid, slug: 't' },
    location: null,
    role: 'ADMIN',
  });

const staff = () =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: null,
    role: 'STAFF',
  });

describe('resolveSetTaxRate', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveSetTaxRate(
        {},
        { taxCategoryId: 'tc-1', locationId: 'l-1', ratePermille: 825 },
        staff(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('happy path: no prior open rate → creates first rate, writes audit', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce({ id: 'tc-1' });
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'l-1' });
    mockTaxRateFindFirst.mockResolvedValueOnce(null);
    mockTaxRateCreate.mockResolvedValueOnce({ id: 'tr-1' });
    const result = await resolveSetTaxRate(
      {},
      { taxCategoryId: 'tc-1', locationId: 'l-1', ratePermille: 825 },
      admin('t-9'),
    );
    expect(result).toEqual({ id: 'tr-1' });
    expect(mockTaxRateUpdate).not.toHaveBeenCalled();
    const createCall = mockTaxRateCreate.mock.calls[0]?.[0];
    expect(createCall.data).toMatchObject({
      taxCategoryId: 'tc-1',
      locationId: 'l-1',
      ratePermille: 825,
      effectiveUntil: null,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('catalog.tax_rate.set');
  });

  it('updates: closes previous open rate by setting effectiveUntil = new effectiveFrom', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce({ id: 'tc-1' });
    mockLocationFindFirst.mockResolvedValueOnce({ id: 'l-1' });
    mockTaxRateFindFirst.mockResolvedValueOnce({ id: 'tr-prev' });
    mockTaxRateUpdate.mockResolvedValueOnce({ id: 'tr-prev' });
    mockTaxRateCreate.mockResolvedValueOnce({ id: 'tr-new' });
    const cutoff = new Date('2026-04-25T00:00:00Z');
    await resolveSetTaxRate(
      {},
      {
        taxCategoryId: 'tc-1',
        locationId: 'l-1',
        ratePermille: 900,
        effectiveFrom: cutoff,
      },
      admin('t-9'),
    );
    expect(mockTaxRateUpdate).toHaveBeenCalledTimes(1);
    expect(mockTaxRateUpdate.mock.calls[0]?.[0]).toEqual({
      where: { id: 'tr-prev' },
      data: { effectiveUntil: cutoff },
    });
    const createCall = mockTaxRateCreate.mock.calls[0]?.[0];
    expect(createCall.data.effectiveFrom).toEqual(cutoff);
    expect(createCall.data.effectiveUntil).toBeNull();
  });

  it('cross-tenant: rejects when tax category belongs to another tenant', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveSetTaxRate(
        {},
        { taxCategoryId: 'tc-other', locationId: 'l-1', ratePermille: 825 },
        admin('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockTaxRateCreate).not.toHaveBeenCalled();
  });

  it('cross-tenant: rejects when location belongs to another tenant', async () => {
    mockTaxCategoryFindFirst.mockResolvedValueOnce({ id: 'tc-1' });
    mockLocationFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveSetTaxRate(
        {},
        { taxCategoryId: 'tc-1', locationId: 'l-other', ratePermille: 825 },
        admin('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
