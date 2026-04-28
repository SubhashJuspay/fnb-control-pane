import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPublish } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../pubsub.js', () => ({
  pubsub: { publish: mockPublish },
  ticketChannelName: (id: string) => `ticket_updates_${id}`,
  floorChannelName: (id: string) => `floor_updates_${id}`,
}));

import type { PrismaClient } from '@repo/db';
import { completeReservationAfterClose } from './post-close.js';

function makeMockPrisma(opts: {
  reservation?: { id: string; tableId: string | null } | null;
  updateError?: Error;
}): PrismaClient {
  const findFirst = vi.fn().mockResolvedValue(opts.reservation ?? null);
  const update = opts.updateError
    ? vi.fn().mockRejectedValue(opts.updateError)
    : vi.fn().mockResolvedValue({ id: opts.reservation?.id });
  return {
    reservation: { findFirst, update },
  } as unknown as PrismaClient;
}

beforeEach(() => mockPublish.mockClear());

describe('completeReservationAfterClose', () => {
  it('no-op when no SEATED reservation is linked to ticket', async () => {
    const prisma = makeMockPrisma({ reservation: null });
    await completeReservationAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-9',
    });
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('transitions SEATED reservation to COMPLETED and publishes Reservation+Table events', async () => {
    const prisma = makeMockPrisma({ reservation: { id: 'r-1', tableId: 't-1' } });
    await completeReservationAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-9',
    });
    const updateMock = (prisma.reservation.update as unknown) as ReturnType<typeof vi.fn>;
    const data = updateMock.mock.calls[0]?.[0].data;
    expect(data.status).toBe('COMPLETED');
    expect(data.completedAt).toBeInstanceOf(Date);
    const events = mockPublish.mock.calls.map((c) => c[1].kind);
    expect(events).toContain('ReservationChanged');
    expect(events).toContain('TableChanged');
  });

  it('publishes only ReservationChanged when reservation has no tableId', async () => {
    const prisma = makeMockPrisma({ reservation: { id: 'r-1', tableId: null } });
    await completeReservationAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-9',
    });
    const events = mockPublish.mock.calls.map((c) => c[1].kind);
    expect(events).toEqual(['ReservationChanged']);
  });

  it('swallows errors so it never blocks POS close', async () => {
    const prisma = makeMockPrisma({
      reservation: { id: 'r-1', tableId: null },
      updateError: new Error('db down'),
    });
    await expect(
      completeReservationAfterClose({
        prisma,
        ticketId: 'tk-1',
        locationId: 'loc-9',
      }),
    ).resolves.toBeUndefined();
  });
});
