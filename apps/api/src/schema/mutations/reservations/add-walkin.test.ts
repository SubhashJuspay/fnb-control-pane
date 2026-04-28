import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReservationCreate,
  mockAuditCreate,
  mockPublish,
} = vi.hoisted(() => ({
  mockReservationCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../prisma.js', () => ({
  prisma: {
    reservation: { create: mockReservationCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../../../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { AuthContext, RequestContext } from '../../../context.js';
import { ForbiddenError } from '../../../errors.js';
import { resolveAddWalkin } from './add-walkin.js';

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
      reservation: { create: mockReservationCreate },
      auditLog: { create: mockAuditCreate },
    } as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx: RequestContext = ctxFor({
  kind: 'authenticated',
  user: { id: 'u-1', email: 'u@t' },
  tenant: { id: 't-1', slug: 't' },
  location: { id: 'loc-9', timezone: 'UTC', currency: 'USD' },
  role: 'STAFF',
});

beforeEach(() => {
  mockReservationCreate.mockReset();
  mockAuditCreate.mockReset();
  mockPublish.mockClear();
});

describe('resolveAddWalkin', () => {
  it('rejects anonymous', async () => {
    await expect(
      resolveAddWalkin(
        {},
        { guestName: 'Sarah', partySize: 2 },
        ctxFor({ kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('happy path: creates WALKIN+WAITING', async () => {
    mockReservationCreate.mockResolvedValueOnce({ id: 'r-1' });
    await resolveAddWalkin({}, { guestName: 'Sarah', partySize: 2 }, staffCtx);
    const data = mockReservationCreate.mock.calls[0]?.[0].data;
    expect(data.kind).toBe('WALKIN');
    expect(data.status).toBe('WAITING');
    expect(data.requestedTime).toBeNull();
    expect(data.locationId).toBe('loc-9');
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe('walkin.added');
    expect(mockPublish).toHaveBeenCalledWith('floor_updates_loc-9', {
      kind: 'ReservationChanged',
      reservationId: 'r-1',
    });
  });
});
