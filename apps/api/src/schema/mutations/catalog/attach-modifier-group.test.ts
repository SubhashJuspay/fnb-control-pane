import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMenuItemFindFirst,
  mockModifierGroupFindFirst,
  mockMimGroupFindUnique,
  mockMimGroupFindFirst,
  mockMimGroupCreate,
  mockMimGroupDelete,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockMenuItemFindFirst: vi.fn(),
  mockModifierGroupFindFirst: vi.fn(),
  mockMimGroupFindUnique: vi.fn(),
  mockMimGroupFindFirst: vi.fn(),
  mockMimGroupCreate: vi.fn(),
  mockMimGroupDelete: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    menuItem: { findFirst: mockMenuItemFindFirst },
    modifierGroup: { findFirst: mockModifierGroupFindFirst },
    menuItemModifierGroup: {
      findUnique: mockMimGroupFindUnique,
      findFirst: mockMimGroupFindFirst,
      create: mockMimGroupCreate,
      delete: mockMimGroupDelete,
    },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import {
  resolveAttachModifierGroup,
  resolveDetachModifierGroup,
} from './attach-modifier-group.js';

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
      menuItem: { findFirst: mockMenuItemFindFirst },
      modifierGroup: { findFirst: mockModifierGroupFindFirst },
      menuItemModifierGroup: {
        findUnique: mockMimGroupFindUnique,
        findFirst: mockMimGroupFindFirst,
        create: mockMimGroupCreate,
        delete: mockMimGroupDelete,
      },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => {
  mockMenuItemFindFirst.mockReset();
  mockModifierGroupFindFirst.mockReset();
  mockMimGroupFindUnique.mockReset();
  mockMimGroupFindFirst.mockReset();
  mockMimGroupCreate.mockReset();
  mockMimGroupDelete.mockReset();
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

describe('resolveAttachModifierGroup', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveAttachModifierGroup(
        { menuItemId: 'mi-1', modifierGroupId: 'mg-1' },
        staff(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant menu item → NotFound', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveAttachModifierGroup(
        { menuItemId: 'mi-other', modifierGroupId: 'mg-1' },
        admin('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cross-tenant modifier group → NotFound', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockModifierGroupFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveAttachModifierGroup(
        { menuItemId: 'mi-1', modifierGroupId: 'mg-other' },
        admin('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('duplicate attachment → ConflictError', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockModifierGroupFindFirst.mockResolvedValueOnce({ id: 'mg-1' });
    mockMimGroupFindUnique.mockResolvedValueOnce({ menuItemId: 'mi-1' });
    await expect(
      resolveAttachModifierGroup(
        { menuItemId: 'mi-1', modifierGroupId: 'mg-1' },
        admin(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path attaches with auto sortOrder', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockModifierGroupFindFirst.mockResolvedValueOnce({ id: 'mg-1' });
    mockMimGroupFindUnique.mockResolvedValueOnce(null);
    mockMimGroupFindFirst.mockResolvedValueOnce({ sortOrder: 4 });
    mockMimGroupCreate.mockResolvedValueOnce({});
    const result = await resolveAttachModifierGroup(
      { menuItemId: 'mi-1', modifierGroupId: 'mg-1' },
      admin(),
    );
    expect(result.sortOrder).toBe(5);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'catalog.item.modifier_group.attached',
    );
  });
});

describe('resolveDetachModifierGroup', () => {
  it('rejects STAFF', async () => {
    await expect(
      resolveDetachModifierGroup(
        { menuItemId: 'mi-1', modifierGroupId: 'mg-1' },
        staff(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant menu item → NotFound', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveDetachModifierGroup(
        { menuItemId: 'mi-other', modifierGroupId: 'mg-1' },
        admin('t-A'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('happy path deletes and writes audit', async () => {
    mockMenuItemFindFirst.mockResolvedValueOnce({ id: 'mi-1' });
    mockMimGroupFindUnique.mockResolvedValueOnce({ menuItemId: 'mi-1' });
    mockMimGroupDelete.mockResolvedValueOnce({});
    await resolveDetachModifierGroup(
      { menuItemId: 'mi-1', modifierGroupId: 'mg-1' },
      admin(),
    );
    expect(mockMimGroupDelete).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'catalog.item.modifier_group.detached',
    );
  });
});
