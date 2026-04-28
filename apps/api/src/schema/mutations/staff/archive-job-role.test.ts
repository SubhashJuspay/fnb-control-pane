import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockJobRoleFindFirst,
  mockJobRoleUpdate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockJobRoleFindFirst: vi.fn(),
  mockJobRoleUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    jobRole: { findFirst: mockJobRoleFindFirst, update: mockJobRoleUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { NotFoundError } from '../../../errors.js';
import { resolveArchiveJobRole } from './archive-job-role.js';

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
      jobRole: { findFirst: mockJobRoleFindFirst, update: mockJobRoleUpdate },
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
  mockJobRoleFindFirst.mockReset();
  mockJobRoleUpdate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveArchiveJobRole', () => {
  it('rejects when not found', async () => {
    mockJobRoleFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveArchiveJobRole({}, { id: 'jr-1' }, adminCtx),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('archives and audits', async () => {
    mockJobRoleFindFirst.mockResolvedValueOnce({ id: 'jr-1' });
    mockJobRoleUpdate.mockResolvedValueOnce({ id: 'jr-1' });
    await resolveArchiveJobRole({}, { id: 'jr-1' }, adminCtx);
    const data = mockJobRoleUpdate.mock.calls[0]?.[0].data as { archivedAt: Date };
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('job_role.archived');
  });
});
