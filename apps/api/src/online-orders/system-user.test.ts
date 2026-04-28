import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@repo/db';
import { ensureSystemUser } from './system-user.js';

function makeMockPrisma(opts: {
  initialSystemUserId?: string | null;
  upsertedUserId: string;
}): { prisma: PrismaClient; tenantUpdate: ReturnType<typeof vi.fn>; userUpsert: ReturnType<typeof vi.fn>; tenantFindUnique: ReturnType<typeof vi.fn> } {
  const tenantFindUnique = vi
    .fn()
    .mockResolvedValue(opts.initialSystemUserId !== undefined ? { systemUserId: opts.initialSystemUserId } : null);
  const userUpsert = vi.fn().mockResolvedValue({ id: opts.upsertedUserId });
  const tenantUpdate = vi.fn().mockResolvedValue({});
  const prisma = {
    tenant: { findUnique: tenantFindUnique, update: tenantUpdate },
    user: { upsert: userUpsert },
  } as unknown as PrismaClient;
  return { prisma, tenantUpdate, userUpsert, tenantFindUnique };
}

describe('ensureSystemUser', () => {
  it('returns the existing systemUserId when set', async () => {
    const { prisma, userUpsert, tenantUpdate } = makeMockPrisma({
      initialSystemUserId: 'existing-user-id',
      upsertedUserId: 'should-not-be-used',
    });
    const id = await ensureSystemUser(prisma, 'tenant-1', 'acme');
    expect(id).toBe('existing-user-id');
    expect(userUpsert).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it('creates and links a new system user when missing', async () => {
    const { prisma, userUpsert, tenantUpdate } = makeMockPrisma({
      initialSystemUserId: null,
      upsertedUserId: 'new-user-id',
    });
    const id = await ensureSystemUser(prisma, '12345678-aaaa-bbbb-cccc-dddddddddddd', 'acme');
    expect(id).toBe('new-user-id');
    expect(userUpsert).toHaveBeenCalledOnce();
    const upsertArg = userUpsert.mock.calls[0]?.[0];
    expect(upsertArg.where.email).toBe('system+12345678@acme.fnb.local');
    expect(upsertArg.create.status).toBe('DISABLED');
    expect(tenantUpdate).toHaveBeenCalledOnce();
    const updateArg = tenantUpdate.mock.calls[0]?.[0];
    expect(updateArg.where.id).toBe('12345678-aaaa-bbbb-cccc-dddddddddddd');
    expect(updateArg.data.systemUserId).toBe('new-user-id');
  });

  it('treats a tenant row that is null as missing systemUserId', async () => {
    const { prisma, userUpsert } = makeMockPrisma({
      upsertedUserId: 'fresh-id',
    });
    const id = await ensureSystemUser(prisma, '99999999-aaaa-bbbb-cccc-dddddddddddd', 'beta');
    expect(id).toBe('fresh-id');
    expect(userUpsert).toHaveBeenCalledOnce();
  });
});
