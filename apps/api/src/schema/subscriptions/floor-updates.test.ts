import { describe, expect, it } from 'vitest';
import type { AuthContext, RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import {
  hydrateFloorEvent,
  subscribeToFloorChannel,
  type FloorChannelDeps,
  type RawFloorEvent,
} from './floor-updates.js';

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
    prisma: {} as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}

const staffCtx = (locationId: string | null = 'loc-1'): RequestContext =>
  ctxFor({
    kind: 'authenticated',
    user: { id: 'u-1', email: 'u@t' },
    tenant: { id: 't-1', slug: 't' },
    location: locationId
      ? { id: locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
      : null,
    role: 'STAFF',
  });

interface MockPubsub {
  subscribe: FloorChannelDeps['pubsub']['subscribe'];
  emit: (channel: string, payload: RawFloorEvent) => void;
  unsubscribed: Set<string>;
}

function makeMockPubsub(): MockPubsub {
  const listeners = new Map<string, Set<(payload: RawFloorEvent) => void>>();
  const unsubscribed = new Set<string>();
  return {
    subscribe: async (channel, listener) => {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      const wrapped = listener as (p: RawFloorEvent) => void;
      set.add(wrapped);
      return () => {
        set!.delete(wrapped);
        unsubscribed.add(channel);
      };
    },
    emit: (channel, payload) => {
      const set = listeners.get(channel);
      if (!set) return;
      for (const l of set) l(payload);
    },
    unsubscribed,
  };
}

function makeMockPrisma(rows: {
  tables?: Record<string, unknown>;
  reservations?: Record<string, unknown>;
  sections?: Record<string, unknown>;
}): FloorChannelDeps['prisma'] {
  return {
    table: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.tables?.[where.id] ?? null,
    },
    reservation: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.reservations?.[where.id] ?? null,
    },
    section: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.sections?.[where.id] ?? null,
    },
  } as unknown as FloorChannelDeps['prisma'];
}

describe('hydrateFloorEvent', () => {
  it('hydrates TableChanged into a Table payload', async () => {
    const prisma = makeMockPrisma({ tables: { 't-1': { id: 't-1', label: 'A' } } });
    const out = await hydrateFloorEvent({ kind: 'TableChanged', tableId: 't-1' }, prisma);
    expect(out).toEqual({
      __resolveType: 'TableChanged',
      table: { id: 't-1', label: 'A' },
    });
  });
  it('hydrates ReservationChanged', async () => {
    const prisma = makeMockPrisma({
      reservations: { 'r-1': { id: 'r-1', status: 'PENDING' } },
    });
    const out = await hydrateFloorEvent(
      { kind: 'ReservationChanged', reservationId: 'r-1' },
      prisma,
    );
    expect(out).toEqual({
      __resolveType: 'ReservationChanged',
      reservation: { id: 'r-1', status: 'PENDING' },
    });
  });
  it('hydrates SectionChanged', async () => {
    const prisma = makeMockPrisma({
      sections: { 's-1': { id: 's-1', name: 'Bar' } },
    });
    const out = await hydrateFloorEvent(
      { kind: 'SectionChanged', sectionId: 's-1' },
      prisma,
    );
    expect(out).toEqual({
      __resolveType: 'SectionChanged',
      section: { id: 's-1', name: 'Bar' },
    });
  });
  it('returns null for deleted entities', async () => {
    const prisma = makeMockPrisma({});
    expect(
      await hydrateFloorEvent({ kind: 'TableChanged', tableId: 'gone' }, prisma),
    ).toBeNull();
    expect(
      await hydrateFloorEvent(
        { kind: 'ReservationChanged', reservationId: 'gone' },
        prisma,
      ),
    ).toBeNull();
    expect(
      await hydrateFloorEvent({ kind: 'SectionChanged', sectionId: 'gone' }, prisma),
    ).toBeNull();
  });
});

describe('subscribeToFloorChannel', () => {
  it('rejects anonymous', async () => {
    const gen = subscribeToFloorChannel(ctxFor({ kind: 'anonymous' }), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects when no location', async () => {
    const gen = subscribeToFloorChannel(staffCtx(null), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('yields hydrated payloads in order, then unsubscribes', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({
      tables: { 't-1': { id: 't-1' } },
      reservations: { 'r-1': { id: 'r-1' } },
    });
    const gen = subscribeToFloorChannel(staffCtx('loc-9'), { pubsub, prisma });

    const first = gen.next();
    await Promise.resolve();
    pubsub.emit('floor_updates_loc-9', { kind: 'TableChanged', tableId: 't-1' });
    const a = await first;
    expect(a.value).toEqual({ __resolveType: 'TableChanged', table: { id: 't-1' } });

    const second = gen.next();
    pubsub.emit('floor_updates_loc-9', {
      kind: 'ReservationChanged',
      reservationId: 'r-1',
    });
    const b = await second;
    expect(b.value).toEqual({
      __resolveType: 'ReservationChanged',
      reservation: { id: 'r-1' },
    });

    await gen.return();
    expect(pubsub.unsubscribed.has('floor_updates_loc-9')).toBe(true);
  });
  it('skips events whose entities have been deleted', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({ tables: { 't-2': { id: 't-2' } } });
    const gen = subscribeToFloorChannel(staffCtx('loc-9'), { pubsub, prisma });
    const first = gen.next();
    await Promise.resolve();
    pubsub.emit('floor_updates_loc-9', { kind: 'TableChanged', tableId: 't-1' }); // deleted
    pubsub.emit('floor_updates_loc-9', { kind: 'TableChanged', tableId: 't-2' });
    const a = await first;
    expect((a.value as { table: { id: string } }).table.id).toBe('t-2');
    await gen.return();
  });
});
