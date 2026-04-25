import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUserFindUnique } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
  },
}));

import type { RequestContext } from '../context.js';
import { resolveViewer } from './viewer.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

function anonCtx(): RequestContext {
  return {
    auth: { kind: 'anonymous' },
    prisma: { user: { findUnique: mockUserFindUnique } } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

function authedCtx(userId: string): RequestContext {
  return {
    auth: {
      kind: 'authenticated',
      user: { id: userId, email: 'u@test' },
      tenant: { id: 't-1', slug: 'tenant' },
      location: null,
      role: 'OWNER',
    },
    prisma: { user: { findUnique: mockUserFindUnique } } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

beforeEach(() => mockUserFindUnique.mockReset());

describe('resolveViewer', () => {
  it('returns null for anonymous viewer with no side-channel userId', async () => {
    const result = await resolveViewer(anonCtx());
    expect(result).toBeNull();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('returns the authenticated user', async () => {
    const u = { id: 'u-1', email: 'a@b', name: 'A' };
    mockUserFindUnique.mockResolvedValueOnce(u);
    const result = await resolveViewer(authedCtx('u-1'));
    expect(result).toEqual(u);
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { id: true, email: true, name: true },
    });
  });

  it('respects the __userId side-channel for tenantless authenticated viewers', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'u-9', email: 'x@y', name: null });
    const ctx = anonCtx() as RequestContext & { __userId?: string };
    ctx.__userId = 'u-9';
    const result = await resolveViewer(ctx);
    expect(result).toEqual({ id: 'u-9', email: 'x@y', name: null });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'u-9' },
      select: { id: true, email: true, name: true },
    });
  });
});
