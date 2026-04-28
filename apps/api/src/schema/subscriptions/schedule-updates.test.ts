import { describe, expect, it } from 'vitest';
import type { AuthContext, RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import {
  hydrateScheduleEvent,
  subscribeToScheduleChannel,
  type RawScheduleEvent,
  type ScheduleChannelDeps,
} from './schedule-updates.js';

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
      ? { id: locationId, timezone: 'UTC', currency: 'USD' }
      : null,
    role: 'STAFF',
  });

interface MockPubsub {
  subscribe: ScheduleChannelDeps['pubsub']['subscribe'];
  emit: (channel: string, payload: RawScheduleEvent) => void;
  unsubscribed: Set<string>;
}

function makeMockPubsub(): MockPubsub {
  const listeners = new Map<string, Set<(payload: RawScheduleEvent) => void>>();
  const unsubscribed = new Set<string>();
  return {
    subscribe: async (channel, listener) => {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      const wrapped = listener as (p: RawScheduleEvent) => void;
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
  shifts?: Record<string, unknown>;
  timeEntries?: Record<string, unknown>;
}): ScheduleChannelDeps['prisma'] {
  return {
    shift: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.shifts?.[where.id] ?? null,
    },
    timeEntry: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.timeEntries?.[where.id] ?? null,
    },
  } as unknown as ScheduleChannelDeps['prisma'];
}

describe('hydrateScheduleEvent', () => {
  it('hydrates ShiftChanged', async () => {
    const prisma = makeMockPrisma({ shifts: { 's-1': { id: 's-1' } } });
    const out = await hydrateScheduleEvent(
      { kind: 'ShiftChanged', shiftId: 's-1' },
      prisma,
    );
    expect(out).toEqual({ __resolveType: 'ShiftChanged', shift: { id: 's-1' } });
  });
  it('hydrates TimeEntryChanged carrying userId', async () => {
    const prisma = makeMockPrisma({ timeEntries: { 'te-1': { id: 'te-1' } } });
    const out = await hydrateScheduleEvent(
      { kind: 'TimeEntryChanged', timeEntryId: 'te-1', userId: 'u-7' },
      prisma,
    );
    expect(out).toEqual({
      __resolveType: 'TimeEntryChanged',
      timeEntry: { id: 'te-1' },
      userId: 'u-7',
    });
  });
  it('returns null for deleted entities', async () => {
    const prisma = makeMockPrisma({});
    expect(
      await hydrateScheduleEvent({ kind: 'ShiftChanged', shiftId: 'gone' }, prisma),
    ).toBeNull();
  });
});

describe('subscribeToScheduleChannel', () => {
  it('rejects anonymous', async () => {
    const gen = subscribeToScheduleChannel(ctxFor({ kind: 'anonymous' }), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('rejects when no location', async () => {
    const gen = subscribeToScheduleChannel(staffCtx(null), {
      pubsub: makeMockPubsub(),
      prisma: makeMockPrisma({}),
    });
    await expect(gen.next()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('yields hydrated payloads in order, then unsubscribes', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({
      shifts: { 's-1': { id: 's-1' } },
      timeEntries: { 'te-1': { id: 'te-1' } },
    });
    const gen = subscribeToScheduleChannel(staffCtx('loc-9'), { pubsub, prisma });
    const first = gen.next();
    await Promise.resolve();
    pubsub.emit('schedule_updates_loc-9', {
      kind: 'ShiftChanged',
      shiftId: 's-1',
    });
    const a = await first;
    expect(a.value).toEqual({
      __resolveType: 'ShiftChanged',
      shift: { id: 's-1' },
    });

    const second = gen.next();
    pubsub.emit('schedule_updates_loc-9', {
      kind: 'TimeEntryChanged',
      timeEntryId: 'te-1',
      userId: 'u-1',
    });
    const b = await second;
    expect(b.value).toEqual({
      __resolveType: 'TimeEntryChanged',
      timeEntry: { id: 'te-1' },
      userId: 'u-1',
    });

    await gen.return();
    expect(pubsub.unsubscribed.has('schedule_updates_loc-9')).toBe(true);
  });
  it('skips events whose entities have been deleted', async () => {
    const pubsub = makeMockPubsub();
    const prisma = makeMockPrisma({ shifts: { 's-2': { id: 's-2' } } });
    const gen = subscribeToScheduleChannel(staffCtx('loc-9'), { pubsub, prisma });
    const first = gen.next();
    await Promise.resolve();
    pubsub.emit('schedule_updates_loc-9', {
      kind: 'ShiftChanged',
      shiftId: 's-1', // deleted
    });
    pubsub.emit('schedule_updates_loc-9', {
      kind: 'ShiftChanged',
      shiftId: 's-2',
    });
    const a = await first;
    expect((a.value as { shift: { id: string } }).shift.id).toBe('s-2');
    await gen.return();
  });
});
