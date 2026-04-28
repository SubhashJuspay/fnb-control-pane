import { describe, expect, it } from 'vitest';
import type { AuthContext, RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import {
  hydrateOnlineOrderEvent,
  subscribeToOnlineOrdersChannel,
  type OnlineOrderChannelDeps,
  type RawOnlineOrderEvent,
} from './online-order-requests.js';

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
  subscribe: OnlineOrderChannelDeps['pubsub']['subscribe'];
  emit: (channel: string, payload: RawOnlineOrderEvent) => void;
  unsubscribed: Set<string>;
}

function makeMockPubsub(): MockPubsub {
  const listeners = new Map<string, Set<(p: RawOnlineOrderEvent) => void>>();
  const unsubscribed = new Set<string>();
  return {
    subscribe: async (channel, listener) => {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      const wrapped = listener as (p: RawOnlineOrderEvent) => void;
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

function makeMockPrisma(rows: Record<string, unknown>): OnlineOrderChannelDeps['prisma'] {
  return {
    onlineOrderRequest: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows[where.id] ?? null,
    },
  } as unknown as OnlineOrderChannelDeps['prisma'];
}

describe('hydrateOnlineOrderEvent', () => {
  it('hydrates a Created event', async () => {
    const prisma = makeMockPrisma({ 'r-1': { id: 'r-1', customerName: 'B' } });
    const out = await hydrateOnlineOrderEvent(
      { kind: 'OnlineOrderRequestCreated', requestId: 'r-1' },
      prisma,
    );
    expect(out).toEqual({
      __resolveType: 'OnlineOrderRequestCreated',
      request: { id: 'r-1', customerName: 'B' },
    });
  });

  it('hydrates an Updated event', async () => {
    const prisma = makeMockPrisma({ 'r-1': { id: 'r-1' } });
    const out = await hydrateOnlineOrderEvent(
      { kind: 'OnlineOrderRequestUpdated', requestId: 'r-1' },
      prisma,
    );
    expect(out?.__resolveType).toBe('OnlineOrderRequestUpdated');
  });

  it('returns null when request deleted', async () => {
    const prisma = makeMockPrisma({});
    expect(
      await hydrateOnlineOrderEvent(
        { kind: 'OnlineOrderRequestCreated', requestId: 'gone' },
        prisma,
      ),
    ).toBeNull();
  });
});

describe('subscribeToOnlineOrdersChannel (pure)', () => {
  it('rejects anonymous callers', async () => {
    const gen = subscribeToOnlineOrdersChannel(ctxFor({ kind: 'anonymous' }), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when no location is resolved', async () => {
    const gen = subscribeToOnlineOrdersChannel(staffCtx(null), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('yields hydrated payloads + unsubscribes on return', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({
      'r-1': { id: 'r-1', customerName: 'B' },
    });
    const gen = subscribeToOnlineOrdersChannel(staffCtx('loc-9'), {
      pubsub,
      prisma,
    });
    const first = gen.next();
    await Promise.resolve();
    pubsub.emit('online_orders_loc-9', {
      kind: 'OnlineOrderRequestCreated',
      requestId: 'r-1',
    });
    const a = await first;
    expect(a.value).toEqual({
      __resolveType: 'OnlineOrderRequestCreated',
      request: { id: 'r-1', customerName: 'B' },
    });
    await gen.return();
    expect(pubsub.unsubscribed.has('online_orders_loc-9')).toBe(true);
  });
});
