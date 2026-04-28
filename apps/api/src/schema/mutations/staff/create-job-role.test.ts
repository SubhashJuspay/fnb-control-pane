import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockJobRoleFindFirst, mockJobRoleCreate, mockAuditCreate } = vi.hoisted(
  () => ({
    mockJobRoleFindFirst: vi.fn(),
    mockJobRoleCreate: vi.fn(),
    mockAuditCreate: vi.fn(),
  }),
);

vi.mock('../../../prisma.js', () => ({
  prisma: {
    jobRole: { findFirst: mockJobRoleFindFirst, create: mockJobRoleCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError } from '../../../errors.js';
import { resolveCreateJobRole } from './create-job-role.js';

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
      jobRole: { findFirst: mockJobRoleFindFirst, create: mockJobRoleCreate },
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

const managerCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-1', timezone: 'UTC', currency: 'USD' },
  role: 'MANAGER',
});

beforeEach(() => {
  mockJobRoleFindFirst.mockReset();
  mockJobRoleCreate.mockReset();
  mockAuditCreate.mockReset();
});

describe('resolveCreateJobRole', () => {
  it('rejects MANAGER role', async () => {
    await expect(
      resolveCreateJobRole({}, { name: 'Server', color: '#ff0000' }, managerCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects duplicate name', async () => {
    mockJobRoleFindFirst.mockResolvedValueOnce({ id: 'jr-1' });
    await expect(
      resolveCreateJobRole({}, { name: 'Server' }, adminCtx),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it('happy path: defaults color, audits, scopes by tenant', async () => {
    mockJobRoleFindFirst.mockResolvedValueOnce(null);
    mockJobRoleCreate.mockResolvedValueOnce({ id: 'jr-1' });
    await resolveCreateJobRole({}, { name: 'Server' }, adminCtx);
    expect(mockJobRoleCreate.mock.calls[0]?.[0].data).toMatchObject({
      tenantId: 't-1',
      name: 'Server',
      color: '#6366f1',
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('job_role.created');
  });
});
