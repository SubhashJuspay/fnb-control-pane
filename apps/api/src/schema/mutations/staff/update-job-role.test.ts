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
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveUpdateJobRole } from './update-job-role.js';

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

describe('resolveUpdateJobRole', () => {
  it('rejects when job role missing', async () => {
    mockJobRoleFindFirst.mockResolvedValueOnce(null);
    await expect(
      resolveUpdateJobRole(
        {},
        { id: '11111111-1111-1111-1111-111111111111', name: 'X' },
        adminCtx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejects duplicate rename', async () => {
    mockJobRoleFindFirst
      .mockResolvedValueOnce({ id: 'jr-1', name: 'Server' })
      .mockResolvedValueOnce({ id: 'jr-2' });
    await expect(
      resolveUpdateJobRole(
        {},
        { id: 'jr-1', name: 'Bar' },
        adminCtx,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path updates and audits', async () => {
    mockJobRoleFindFirst.mockResolvedValueOnce({ id: 'jr-1', name: 'Server' });
    mockJobRoleUpdate.mockResolvedValueOnce({ id: 'jr-1' });
    await resolveUpdateJobRole({}, { id: 'jr-1', color: '#abcdef' }, adminCtx);
    expect(mockJobRoleUpdate.mock.calls[0]?.[0].data).toMatchObject({
      color: '#abcdef',
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('job_role.updated');
  });
});

describe('resolveUpdateJobRole forbidden', () => {
  it('rejects non-admin', async () => {
    const staffCtx = ctxFor({
      kind: 'authenticated',
      user: { id: 'u-1', email: 'u@t' },
      tenant: { id: 't-1', slug: 't' },
      location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
      role: 'STAFF',
    });
    await expect(
      resolveUpdateJobRole({}, { id: 'jr-1', name: 'X' }, staffCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
