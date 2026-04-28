import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindUnique, mockUpdate, mockAuditCreate, mockPublish } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    ticketItem: { findUnique: mockFindUnique, update: mockUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (locationId: string) => `ticket_updates_${locationId}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ConflictError } from '../../../errors.js';
import { resolveMarkTicketItemServed } from './mark-ticket-item-served.js';

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
      ticketItem: { findUnique: mockFindUnique, update: mockUpdate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: { id: 'loc-1', timezone: 'America/Los_Angeles', currency: 'USD' },
    role: 'STAFF',
  });

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveMarkTicketItemServed', () => {
  it('rejects FIRED → SERVED (must be READY first)', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'FIRED',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    await expect(
      resolveMarkTicketItemServed({}, { ticketItemId: 'ti' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path READY → SERVED with servedAt + servedById', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'READY',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    mockUpdate.mockResolvedValueOnce({ id: 'ti' });
    await resolveMarkTicketItemServed({}, { ticketItemId: 'ti' }, staffCtx());
    const data = mockUpdate.mock.calls[0]?.[0].data;
    expect(data.status).toBe('SERVED');
    expect(data.servedById).toBe('u-1');
    expect(data.servedAt).toBeInstanceOf(Date);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'ticket_item.marked_served',
    );
  });
});
