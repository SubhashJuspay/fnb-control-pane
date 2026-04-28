import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@repo/db';
import { updateGuestLastSeenAfterClose } from './post-close.js';

interface MockState {
  ticket?: { guestId: string | null; closedAt: Date | null } | null;
  guest?: { lastSeenAt: Date | null } | null;
  updateError?: Error;
}

function makeMockPrisma(state: MockState): {
  prisma: PrismaClient;
  updateMock: ReturnType<typeof vi.fn>;
  ticketFindFirst: ReturnType<typeof vi.fn>;
  guestFindUnique: ReturnType<typeof vi.fn>;
} {
  const ticketFindFirst = vi.fn().mockResolvedValue(state.ticket ?? null);
  const guestFindUnique = vi.fn().mockResolvedValue(state.guest ?? null);
  const updateMock = state.updateError
    ? vi.fn().mockRejectedValue(state.updateError)
    : vi.fn().mockResolvedValue({});
  const prisma = {
    ticket: { findFirst: ticketFindFirst },
    guest: { findUnique: guestFindUnique, update: updateMock },
  } as unknown as PrismaClient;
  return { prisma, updateMock, ticketFindFirst, guestFindUnique };
}

describe('updateGuestLastSeenAfterClose', () => {
  it('no-op when ticket not found', async () => {
    const { prisma, updateMock } = makeMockPrisma({ ticket: null });
    await updateGuestLastSeenAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-1',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('no-op when ticket has no guestId', async () => {
    const { prisma, updateMock } = makeMockPrisma({
      ticket: { guestId: null, closedAt: new Date() },
    });
    await updateGuestLastSeenAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-1',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('no-op when ticket has no closedAt', async () => {
    const { prisma, updateMock } = makeMockPrisma({
      ticket: { guestId: 'g-1', closedAt: null },
    });
    await updateGuestLastSeenAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-1',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('no-op when guest not found', async () => {
    const { prisma, updateMock } = makeMockPrisma({
      ticket: { guestId: 'g-1', closedAt: new Date() },
      guest: null,
    });
    await updateGuestLastSeenAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-1',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates lastSeenAt when guest has no prior lastSeenAt', async () => {
    const closedAt = new Date('2026-04-26T19:00:00Z');
    const { prisma, updateMock } = makeMockPrisma({
      ticket: { guestId: 'g-1', closedAt },
      guest: { lastSeenAt: null },
    });
    await updateGuestLastSeenAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-1',
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]?.[0].data.lastSeenAt).toEqual(closedAt);
  });

  it('updates lastSeenAt when ticket closedAt is newer', async () => {
    const closedAt = new Date('2026-04-27T19:00:00Z');
    const oldSeen = new Date('2026-04-26T10:00:00Z');
    const { prisma, updateMock } = makeMockPrisma({
      ticket: { guestId: 'g-1', closedAt },
      guest: { lastSeenAt: oldSeen },
    });
    await updateGuestLastSeenAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-1',
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]?.[0].data.lastSeenAt).toEqual(closedAt);
  });

  it('does not regress lastSeenAt when ticket closedAt is older', async () => {
    const oldClosed = new Date('2026-04-20T19:00:00Z');
    const newer = new Date('2026-04-26T10:00:00Z');
    const { prisma, updateMock } = makeMockPrisma({
      ticket: { guestId: 'g-1', closedAt: oldClosed },
      guest: { lastSeenAt: newer },
    });
    await updateGuestLastSeenAfterClose({
      prisma,
      ticketId: 'tk-1',
      locationId: 'loc-1',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('swallows errors so it never blocks ticket close', async () => {
    const { prisma } = makeMockPrisma({
      ticket: { guestId: 'g-1', closedAt: new Date() },
      guest: { lastSeenAt: null },
      updateError: new Error('db down'),
    });
    await expect(
      updateGuestLastSeenAfterClose({
        prisma,
        ticketId: 'tk-1',
        locationId: 'loc-1',
      }),
    ).resolves.toBeUndefined();
  });
});
