import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockModifierGroupCreate,
  mockModifierGroupFindFirst,
  mockModifierGroupUpdate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockModifierGroupCreate: vi.fn(),
  mockModifierGroupFindFirst: vi.fn(),
  mockModifierGroupUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    modifierGroup: {
      create: mockModifierGroupCreate,
      findFirst: mockModifierGroupFindFirst,
      update: mockModifierGroupUpdate,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveArchiveModifierGroup } from './archive-modifier-group.js';
import { resolveCreateModifierGroup } from './create-modifier-group.js';
import { resolveUpdateModifierGroup } from './update-modifier-group.js';

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
      modifierGroup: {
        create: mockModifierGroupCreate,
        findFirst: mockModifierGroupFindFirst,
        update: mockModifierGroupUpdate,
      },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockModifierGroupCreate.mockReset();
  mockModifierGroupFindFirst.mockReset();
  mockModifierGroupUpdate.mockReset();
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

const staff = () =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: null,
    role: 'STAFF',
  });

describe('resolveCreateModifierGroup', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveCreateModifierGroup({}, { name: 'Toppings' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('happy path creates with defaults and writes audit', async () => {
    mockModifierGroupCreate.mockResolvedValueOnce({ id: 'mg-1' });
    await resolveCreateModifierGroup({}, { name: 'Toppings' }, admin('t-9'));
    expect(mockModifierGroupCreate.mock.calls[0]?.[0].data).toMatchObject({
      tenantId: 't-9',
      name: 'Toppings',
      minSelections: 0,
      maxSelections: 1,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'catalog.modifier_group.created',
    );
  });
});

describe('resolveUpdateModifierGroup', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveUpdateModifierGroup({}, { id: 'mg-1', name: 'X' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant lookup returns NotFound', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateModifierGroup({}, { id: 'mg-other', name: 'X' }, admin('t-A')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path updates and writes audit', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce({ id: 'mg-1' });
    mockModifierGroupUpdate.mockResolvedValueOnce({ id: 'mg-1' });
    await resolveUpdateModifierGroup(
      {},
      { id: 'mg-1', name: 'New', minSelections: 1, maxSelections: 3 },
      admin(),
    );
    expect(mockModifierGroupUpdate.mock.calls[0]?.[0].data).toEqual({
      name: 'New',
      minSelections: 1,
      maxSelections: 3,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'catalog.modifier_group.updated',
    );
  });
});

describe('resolveArchiveModifierGroup', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveArchiveModifierGroup({}, { id: 'mg-1' }, staff()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('archives and writes audit', async () => {
    mockModifierGroupFindFirst.mockResolvedValueOnce({ id: 'mg-1' });
    mockModifierGroupUpdate.mockResolvedValueOnce({ id: 'mg-1' });
    await resolveArchiveModifierGroup({}, { id: 'mg-1' }, admin());
    expect(mockModifierGroupUpdate.mock.calls[0]?.[0].data.archivedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'catalog.modifier_group.archived',
    );
  });
});
