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
import { resolveMarkTicketItemReady } from './mark-ticket-item-ready.js';

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

describe('resolveMarkTicketItemReady', () => {
  it('rejects READY → READY (idempotency block)', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'READY',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    await expect(
      resolveMarkTicketItemReady({}, { ticketItemId: 'ti' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects NEW → READY (must be FIRED first)', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'NEW',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    await expect(
      resolveMarkTicketItemReady({}, { ticketItemId: 'ti' }, staffCtx()),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('happy path FIRED → READY with readyAt', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'ti',
      status: 'FIRED',
      ticketId: 'tk',
      ticket: { locationId: 'loc-1', status: 'OPEN' },
    });
    mockUpdate.mockResolvedValueOnce({ id: 'ti' });
    await resolveMarkTicketItemReady({}, { ticketItemId: 'ti' }, staffCtx());
    const data = mockUpdate.mock.calls[0]?.[0].data;
    expect(data.status).toBe('READY');
    expect(data.readyAt).toBeInstanceOf(Date);
    // Spec: no readyById is set
    expect(data.readyById).toBeUndefined();
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      'ticket_item.marked_ready',
    );
  });
});
