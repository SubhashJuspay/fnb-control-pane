import type { PrismaClient, Shift, TimeEntry } from '@repo/db';
import type { RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import { pubsub as defaultPubsub, scheduleChannelName } from '../../pubsub.js';
import { builder } from '../builder.js';
import { ShiftRef } from '../shift.js';
import { TimeEntryRef } from '../time-entry.js';

/**
 * Raw event shapes published on the per-location schedule channel by every
 * shift / time-clock mutation. The subscription field hydrates the
 * referenced entity before yielding to the client.
 */
export type RawScheduleEvent =
  | { kind: 'ShiftChanged'; shiftId: string }
  | { kind: 'TimeEntryChanged'; timeEntryId: string; userId: string };

/**
 * Hydrated payload yielded by the subscription. The discriminator string is
 * exactly the GraphQL union member name so the union resolveType is trivial.
 */
export type HydratedScheduleEvent =
  | { __resolveType: 'ShiftChanged'; shift: Shift }
  | {
      __resolveType: 'TimeEntryChanged';
      timeEntry: TimeEntry;
      userId: string;
    };

export interface ScheduleChannelDeps {
  pubsub: Pick<typeof defaultPubsub, 'subscribe'>;
  prisma: Pick<PrismaClient, 'shift' | 'timeEntry'>;
}

/**
 * Hydrate a raw event by reading the referenced entity from Prisma. Returns
 * null when the entity has been deleted between publish and hydration.
 */
export async function hydrateScheduleEvent(
  raw: RawScheduleEvent,
  prisma: ScheduleChannelDeps['prisma'],
): Promise<HydratedScheduleEvent | null> {
  if (raw.kind === 'ShiftChanged') {
    const shift = (await prisma.shift.findUnique({
      where: { id: raw.shiftId },
    })) as Shift | null;
    if (!shift) return null;
    return { __resolveType: 'ShiftChanged', shift };
  }
  // TimeEntryChanged
  const timeEntry = (await prisma.timeEntry.findUnique({
    where: { id: raw.timeEntryId },
  })) as TimeEntry | null;
  if (!timeEntry) return null;
  return {
    __resolveType: 'TimeEntryChanged',
    timeEntry,
    userId: raw.userId,
  };
}

/**
 * Async-iterable generator that bridges the pg LISTEN/NOTIFY pubsub to a
 * per-request Subscription stream for the schedule channel. Mirrors the
 * pattern from `subscribeToFloorChannel` — buffers events between iterator
 * pulls and unsubscribes when the consumer stops iterating.
 */
export async function* subscribeToScheduleChannel(
  ctx: RequestContext,
  deps: ScheduleChannelDeps,
): AsyncGenerator<HydratedScheduleEvent, void, void> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const channel = scheduleChannelName(ctx.auth.location.id);

  const queue: RawScheduleEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;

  const wakeup = (): void => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  const unsubscribe = await deps.pubsub.subscribe<RawScheduleEvent>(
    channel,
    (payload) => {
      if (closed) return;
      queue.push(payload);
      wakeup();
    },
  );

  try {
    while (!closed) {
      while (queue.length > 0) {
        const raw = queue.shift() as RawScheduleEvent;
        const hydrated = await hydrateScheduleEvent(raw, deps.prisma);
        if (hydrated) yield hydrated;
        if (closed) return;
      }
      if (closed) return;
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    }
  } finally {
    closed = true;
    wakeup();
    try {
      unsubscribe();
    } catch {
      // best-effort: pubsub.subscribe may have torn down already.
    }
  }
}

const ShiftChangedRef = builder
  .objectRef<Extract<HydratedScheduleEvent, { __resolveType: 'ShiftChanged' }>>(
    'ShiftChangedEvent',
  )
  .implement({
    fields: (t) => ({
      shift: t.field({
        type: ShiftRef,
        resolve: (parent) => parent.shift as never,
      }),
    }),
  });

const TimeEntryChangedRef = builder
  .objectRef<
    Extract<HydratedScheduleEvent, { __resolveType: 'TimeEntryChanged' }>
  >('TimeEntryChangedEvent')
  .implement({
    fields: (t) => ({
      timeEntry: t.field({
        type: TimeEntryRef,
        resolve: (parent) => parent.timeEntry as never,
      }),
      userId: t.field({
        type: 'UUID',
        resolve: (parent) => parent.userId,
      }),
    }),
  });

const ScheduleUpdateEventUnion = builder.unionType('ScheduleUpdateEvent', {
  types: [ShiftChangedRef, TimeEntryChangedRef],
  resolveType: (parent) => {
    const kind = (parent as HydratedScheduleEvent).__resolveType;
    if (kind === 'ShiftChanged') return 'ShiftChangedEvent';
    return 'TimeEntryChangedEvent';
  },
});

builder.subscriptionField('scheduleUpdates', (t) =>
  t.field({
    type: ScheduleUpdateEventUnion,
    description:
      "Stream of shift / time-entry events at the viewer's location. " +
      'Backed by Postgres LISTEN/NOTIFY for cross-instance fan-out, served ' +
      'over GraphQL-over-SSE by graphql-yoga.',
    authScopes: { authenticated: true },
    subscribe: (_root, _args, ctx) =>
      subscribeToScheduleChannel(ctx, {
        pubsub: defaultPubsub,
        prisma: ctx.prisma,
      }),
    resolve: (payload) => payload as never,
  }),
);
