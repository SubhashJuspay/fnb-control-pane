import type { PrismaClient, Reservation, Section, Table } from '@repo/db';
import type { RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import {
  pubsub as defaultPubsub,
  floorChannelName,
} from '../../pubsub.js';
import { builder } from '../builder.js';
import { ReservationRef } from '../reservation.js';
import { SectionRef } from '../section.js';
import { TableRef } from '../table.js';

/**
 * Raw event shapes published on the per-location floor channel by every floor
 * or reservation mutation. The subscription field hydrates the referenced
 * entity before yielding to the client.
 */
export type RawFloorEvent =
  | { kind: 'TableChanged'; tableId: string }
  | { kind: 'ReservationChanged'; reservationId: string }
  | { kind: 'SectionChanged'; sectionId: string };

/**
 * Hydrated payload yielded by the subscription. The discriminator string is
 * exactly the GraphQL union member name so the union resolveType is trivial.
 */
export type HydratedFloorEvent =
  | { __resolveType: 'TableChanged'; table: Table }
  | { __resolveType: 'ReservationChanged'; reservation: Reservation }
  | { __resolveType: 'SectionChanged'; section: Section };

export interface FloorChannelDeps {
  pubsub: Pick<typeof defaultPubsub, 'subscribe'>;
  prisma: Pick<PrismaClient, 'table' | 'reservation' | 'section'>;
}

/**
 * Hydrate a raw event by reading the referenced entity from Prisma. Returns
 * null if the entity has been deleted (raced with a delete elsewhere); callers
 * skip nulls.
 */
export async function hydrateFloorEvent(
  raw: RawFloorEvent,
  prisma: FloorChannelDeps['prisma'],
): Promise<HydratedFloorEvent | null> {
  if (raw.kind === 'TableChanged') {
    const table = (await prisma.table.findUnique({
      where: { id: raw.tableId },
    })) as Table | null;
    if (!table) return null;
    return { __resolveType: 'TableChanged', table };
  }
  if (raw.kind === 'ReservationChanged') {
    const reservation = (await prisma.reservation.findUnique({
      where: { id: raw.reservationId },
    })) as Reservation | null;
    if (!reservation) return null;
    return { __resolveType: 'ReservationChanged', reservation };
  }
  // SectionChanged
  const section = (await prisma.section.findUnique({
    where: { id: raw.sectionId },
  })) as Section | null;
  if (!section) return null;
  return { __resolveType: 'SectionChanged', section };
}

/**
 * Async-iterable generator that bridges the pg LISTEN/NOTIFY pubsub to a
 * per-request Subscription stream for the floor channel. Mirrors the pattern
 * from `subscribeToTicketChannel` — buffers events between iterator pulls and
 * unsubscribes when the consumer stops iterating.
 */
export async function* subscribeToFloorChannel(
  ctx: RequestContext,
  deps: FloorChannelDeps,
): AsyncGenerator<HydratedFloorEvent, void, void> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const channel = floorChannelName(ctx.auth.location.id);

  const queue: RawFloorEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;

  const wakeup = (): void => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  const unsubscribe = await deps.pubsub.subscribe<RawFloorEvent>(
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
        const raw = queue.shift() as RawFloorEvent;
        const hydrated = await hydrateFloorEvent(raw, deps.prisma);
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

const TableChangedRef = builder
  .objectRef<Extract<HydratedFloorEvent, { __resolveType: 'TableChanged' }>>(
    'TableChangedEvent',
  )
  .implement({
    fields: (t) => ({
      table: t.field({
        type: TableRef,
        resolve: (parent) => parent.table as never,
      }),
    }),
  });

const ReservationChangedRef = builder
  .objectRef<
    Extract<HydratedFloorEvent, { __resolveType: 'ReservationChanged' }>
  >('ReservationChangedEvent')
  .implement({
    fields: (t) => ({
      reservation: t.field({
        type: ReservationRef,
        resolve: (parent) => parent.reservation as never,
      }),
    }),
  });

const SectionChangedRef = builder
  .objectRef<Extract<HydratedFloorEvent, { __resolveType: 'SectionChanged' }>>(
    'SectionChangedEvent',
  )
  .implement({
    fields: (t) => ({
      section: t.field({
        type: SectionRef,
        resolve: (parent) => parent.section as never,
      }),
    }),
  });

const FloorUpdateEventUnion = builder.unionType('FloorUpdateEvent', {
  types: [TableChangedRef, ReservationChangedRef, SectionChangedRef],
  resolveType: (parent) => {
    const kind = (parent as HydratedFloorEvent).__resolveType;
    if (kind === 'TableChanged') return 'TableChangedEvent';
    if (kind === 'ReservationChanged') return 'ReservationChangedEvent';
    return 'SectionChangedEvent';
  },
});

builder.subscriptionField('floorUpdates', (t) =>
  t.field({
    type: FloorUpdateEventUnion,
    description:
      "Stream of table / reservation / section events at the viewer's location. " +
      'Backed by Postgres LISTEN/NOTIFY for cross-instance fan-out, served ' +
      'over GraphQL-over-SSE by graphql-yoga.',
    authScopes: { staff: true },
    subscribe: (_root, _args, ctx) =>
      subscribeToFloorChannel(ctx, {
        pubsub: defaultPubsub,
        prisma: ctx.prisma,
      }),
    resolve: (payload) => payload as never,
  }),
);
