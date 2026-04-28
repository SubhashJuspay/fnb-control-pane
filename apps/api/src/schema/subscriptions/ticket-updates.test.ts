import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthContext, RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import { setupTestDb, type TestDb } from '../../test/testcontainers.js';
import {
  hydrateTicketEvent,
  subscribeToTicketChannel,
  type RawTicketEvent,
  type TicketChannelDeps,
} from './ticket-updates.js';

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
  subscribe: TicketChannelDeps['pubsub']['subscribe'];
  emit: (channel: string, payload: RawTicketEvent) => void;
  unsubscribed: Set<string>;
}

function makeMockPubsub(): MockPubsub {
  const listeners = new Map<string, Set<(payload: RawTicketEvent) => void>>();
  const unsubscribed = new Set<string>();
  return {
    subscribe: async (channel, listener) => {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      const wrapped = listener as (p: RawTicketEvent) => void;
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
  tickets?: Record<string, unknown>;
  ticketItems?: Record<string, unknown>;
  discounts?: Record<string, unknown>;
}): TicketChannelDeps['prisma'] {
  return {
    ticket: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.tickets?.[where.id] ?? null,
    },
    ticketItem: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.ticketItems?.[where.id] ?? null,
    },
    discount: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.discounts?.[where.id] ?? null,
    },
  } as unknown as TicketChannelDeps['prisma'];
}

describe('hydrateTicketEvent', () => {
  it('hydrates TicketChanged into a Ticket payload', async () => {
    const prisma = makeMockPrisma({
      tickets: { 'tk-1': { id: 'tk-1', shortNumber: 7 } },
    });
    const out = await hydrateTicketEvent(
      { kind: 'TicketChanged', ticketId: 'tk-1' },
      prisma,
    );
    expect(out).toEqual({
      __resolveType: 'TicketChanged',
      ticket: { id: 'tk-1', shortNumber: 7 },
    });
  });

  it('hydrates TicketItemChanged into a TicketItem payload + ticketId', async () => {
    const prisma = makeMockPrisma({
      ticketItems: { 'ti-1': { id: 'ti-1', status: 'NEW' } },
    });
    const out = await hydrateTicketEvent(
      { kind: 'TicketItemChanged', ticketId: 'tk-1', ticketItemId: 'ti-1' },
      prisma,
    );
    expect(out).toEqual({
      __resolveType: 'TicketItemChanged',
      ticketItem: { id: 'ti-1', status: 'NEW' },
      ticketId: 'tk-1',
    });
  });

  it('hydrates DiscountChanged into a Discount payload + ticketId', async () => {
    const prisma = makeMockPrisma({
      discounts: { 'd-1': { id: 'd-1', kind: 'FLAT', computedCents: 100 } },
    });
    const out = await hydrateTicketEvent(
      { kind: 'DiscountChanged', ticketId: 'tk-1', discountId: 'd-1' },
      prisma,
    );
    expect(out).toEqual({
      __resolveType: 'DiscountChanged',
      discount: { id: 'd-1', kind: 'FLAT', computedCents: 100 },
      ticketId: 'tk-1',
    });
  });

  it('returns null when entity has been deleted (race with delete)', async () => {
    const prisma = makeMockPrisma({});
    expect(
      await hydrateTicketEvent(
        { kind: 'TicketChanged', ticketId: 'missing' },
        prisma,
      ),
    ).toBeNull();
    expect(
      await hydrateTicketEvent(
        { kind: 'TicketItemChanged', ticketId: 'tk-1', ticketItemId: 'ti-x' },
        prisma,
      ),
    ).toBeNull();
    expect(
      await hydrateTicketEvent(
        { kind: 'DiscountChanged', ticketId: 'tk-1', discountId: 'd-x' },
        prisma,
      ),
    ).toBeNull();
  });
});

describe('subscribeToTicketChannel (pure, with mock pubsub)', () => {
  it('rejects anonymous callers', async () => {
    const gen = subscribeToTicketChannel(ctxFor({ kind: 'anonymous' }), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when no location is resolved', async () => {
    const gen = subscribeToTicketChannel(staffCtx(null), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('yields hydrated payloads in order, then unsubscribes on return', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({
      tickets: { 'tk-1': { id: 'tk-1', shortNumber: 1 } },
      ticketItems: { 'ti-1': { id: 'ti-1', status: 'NEW' } },
      discounts: { 'd-1': { id: 'd-1', kind: 'FLAT' } },
    });
    const gen = subscribeToTicketChannel(staffCtx('loc-9'), {
      pubsub,
      prisma,
    });

    // Drive the generator: first call must register the subscription. We push
    // an event after a microtask delay so the listener is wired up.
    const first = gen.next();
    await Promise.resolve();
    pubsub.emit('ticket_updates_loc-9', {
      kind: 'TicketChanged',
      ticketId: 'tk-1',
    });
    const a = await first;
    expect(a.done).toBe(false);
    expect(a.value).toEqual({
      __resolveType: 'TicketChanged',
      ticket: { id: 'tk-1', shortNumber: 1 },
    });

    const second = gen.next();
    pubsub.emit('ticket_updates_loc-9', {
      kind: 'TicketItemChanged',
      ticketId: 'tk-1',
      ticketItemId: 'ti-1',
    });
    const b = await second;
    expect(b.value).toEqual({
      __resolveType: 'TicketItemChanged',
      ticketItem: { id: 'ti-1', status: 'NEW' },
      ticketId: 'tk-1',
    });

    const third = gen.next();
    pubsub.emit('ticket_updates_loc-9', {
      kind: 'DiscountChanged',
      ticketId: 'tk-1',
      discountId: 'd-1',
    });
    const c = await third;
    expect(c.value).toEqual({
      __resolveType: 'DiscountChanged',
      discount: { id: 'd-1', kind: 'FLAT' },
      ticketId: 'tk-1',
    });

    // Tear down the consumer; finally-block should unsubscribe.
    await gen.return();
    expect(pubsub.unsubscribed.has('ticket_updates_loc-9')).toBe(true);
  });

  it('skips events whose entities have been deleted', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({
      tickets: { 'tk-2': { id: 'tk-2' } }, // tk-1 missing
    });
    const gen = subscribeToTicketChannel(staffCtx('loc-9'), {
      pubsub,
      prisma,
    });

    const first = gen.next();
    await Promise.resolve();
    // First event references a deleted ticket — should be skipped silently.
    pubsub.emit('ticket_updates_loc-9', {
      kind: 'TicketChanged',
      ticketId: 'tk-1',
    });
    // Second event references a live ticket — should be yielded.
    pubsub.emit('ticket_updates_loc-9', {
      kind: 'TicketChanged',
      ticketId: 'tk-2',
    });
    const a = await first;
    expect(a.value).toEqual({
      __resolveType: 'TicketChanged',
      ticket: { id: 'tk-2' },
    });
    await gen.return();
  });

  it('buffers events that arrive while no consumer is awaiting', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({
      tickets: { 'tk-1': { id: 'tk-1' }, 'tk-2': { id: 'tk-2' } },
    });
    const gen = subscribeToTicketChannel(staffCtx('loc-9'), {
      pubsub,
      prisma,
    });

    // Wire the generator (registers the listener).
    const first = gen.next();
    await Promise.resolve();
    // Emit two before the consumer pulls — both must buffer.
    pubsub.emit('ticket_updates_loc-9', {
      kind: 'TicketChanged',
      ticketId: 'tk-1',
    });
    pubsub.emit('ticket_updates_loc-9', {
      kind: 'TicketChanged',
      ticketId: 'tk-2',
    });
    const a = await first;
    const b = await gen.next();
    expect((a.value as { ticket: { id: string } }).ticket.id).toBe('tk-1');
    expect((b.value as { ticket: { id: string } }).ticket.id).toBe('tk-2');
    await gen.return();
  });
});

describe('subscribeToTicketChannel end-to-end via Postgres LISTEN/NOTIFY', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await setupTestDb();
    // The pubsub singleton reads `env.DATABASE_URL` at first connect — point
    // it at the testcontainer before anything imports it. (`env.ts` was
    // already loaded via the static imports above, so we mutate the cached
    // env object via process.env on the connection itself by re-setting
    // process.env and bypassing the env cache through dynamic import below.)
    process.env.DATABASE_URL = db.container.getConnectionUri();
  }, 240_000);

  afterAll(async () => {
    await db?.cleanup();
  });

  it('publishes through the real pubsub and yields the hydrated ticket', async () => {
    // Mutate the cached env DATABASE_URL so the lazy pubsub Client picks up
    // the testcontainer URI rather than the dummy localhost:5433 from the
    // vitest config.
    const envModule = await import('../../env.js');
    (envModule.env as { DATABASE_URL: string }).DATABASE_URL =
      db.container.getConnectionUri();
    const { pubsub, ticketChannelName } = await import('../../pubsub.js');
    const prisma = db.prisma;

    // Seed enough rows for hydrateTicketEvent → ticket.findUnique to work.
    const tenant = await prisma.tenant.create({
      data: { name: 'Sub Tenant', slug: 'sub-tenant' },
    });
    const location = await prisma.location.create({
      data: {
        tenantId: tenant.id,
        name: 'Main',
        slug: 'main',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
      },
    });
    const user = await prisma.user.create({
      data: { email: 'sub@test', name: 'Sub' },
    });
    const ticket = await prisma.ticket.create({
      data: {
        locationId: location.id,
        shortNumber: 1,
        businessDay: new Date('2026-01-01T00:00:00.000Z'),
        orderType: 'DINE_IN',
        status: 'OPEN',
        openedById: user.id,
      },
    });

    const ctx = ctxFor({
      kind: 'authenticated',
      user: { id: user.id, email: user.email },
      tenant: { id: tenant.id, slug: tenant.slug },
      location: {
        id: location.id,
        timezone: location.timezone,
        currency: location.currency,
      },
      role: 'STAFF',
    });

    const gen = subscribeToTicketChannel(ctx, { pubsub, prisma });

    const first = gen.next();
    // Give the LISTEN command a moment to be issued before NOTIFY.
    await new Promise((r) => setTimeout(r, 100));
    await pubsub.publish(ticketChannelName(location.id), {
      kind: 'TicketChanged',
      ticketId: ticket.id,
    });
    const result = await first;
    expect(result.done).toBe(false);
    const value = result.value as {
      __resolveType: string;
      ticket: { id: string; shortNumber: number };
    };
    expect(value.__resolveType).toBe('TicketChanged');
    expect(value.ticket.id).toBe(ticket.id);
    expect(value.ticket.shortNumber).toBe(1);

    await gen.return();
    await pubsub.close();
  }, 60_000);
});
