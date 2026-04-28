import type { Discount, PrismaClient, Ticket, TicketItem } from '@repo/db';
import type { RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import {
  pubsub as defaultPubsub,
  ticketChannelName,
} from '../../pubsub.js';
import { builder } from '../builder.js';
import { DiscountRef } from '../discount.js';
import { TicketItemRef, TicketRef } from '../ticket.js';

/**
 * Raw event shapes published on the per-location ticket channel by every POS
 * mutation. The subscription field hydrates the referenced entity before
 * yielding to the client.
 */
export type RawTicketEvent =
  | { kind: 'TicketChanged'; ticketId: string }
  | { kind: 'TicketItemChanged'; ticketId: string; ticketItemId: string }
  | { kind: 'DiscountChanged'; ticketId: string; discountId: string };

/**
 * Hydrated payload yielded by the subscription. The discriminator string is
 * exactly the GraphQL union member name so the union resolveType is trivial.
 */
export type HydratedTicketEvent =
  | { __resolveType: 'TicketChanged'; ticket: Ticket }
  | {
      __resolveType: 'TicketItemChanged';
      ticketItem: TicketItem;
      ticketId: string;
    }
  | {
      __resolveType: 'DiscountChanged';
      discount: Discount;
      ticketId: string;
    };

export interface TicketChannelDeps {
  pubsub: Pick<typeof defaultPubsub, 'subscribe'>;
  prisma: Pick<PrismaClient, 'ticket' | 'ticketItem' | 'discount'>;
}

/**
 * Hydrate a raw event by reading the referenced entity from Prisma. Returns
 * null if the entity has been deleted (raced with a delete elsewhere); callers
 * skip nulls.
 */
export async function hydrateTicketEvent(
  raw: RawTicketEvent,
  prisma: TicketChannelDeps['prisma'],
): Promise<HydratedTicketEvent | null> {
  if (raw.kind === 'TicketChanged') {
    const ticket = (await prisma.ticket.findUnique({
      where: { id: raw.ticketId },
    })) as Ticket | null;
    if (!ticket) return null;
    return { __resolveType: 'TicketChanged', ticket };
  }
  if (raw.kind === 'TicketItemChanged') {
    const ticketItem = (await prisma.ticketItem.findUnique({
      where: { id: raw.ticketItemId },
    })) as TicketItem | null;
    if (!ticketItem) return null;
    return {
      __resolveType: 'TicketItemChanged',
      ticketItem,
      ticketId: raw.ticketId,
    };
  }
  // DiscountChanged
  const discount = (await prisma.discount.findUnique({
    where: { id: raw.discountId },
  })) as Discount | null;
  if (!discount) return null;
  return {
    __resolveType: 'DiscountChanged',
    discount,
    ticketId: raw.ticketId,
  };
}

/**
 * Async-iterable generator that bridges the pg LISTEN/NOTIFY pubsub to a
 * per-request Subscription stream. Buffers events between iterator pulls and
 * unsubscribes when the consumer stops iterating.
 *
 * Pure: dependency-injected `pubsub` and `prisma`, both swappable in tests.
 */
export async function* subscribeToTicketChannel(
  ctx: RequestContext,
  deps: TicketChannelDeps,
): AsyncGenerator<HydratedTicketEvent, void, void> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const channel = ticketChannelName(ctx.auth.location.id);

  const queue: RawTicketEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;

  const wakeup = (): void => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  const unsubscribe = await deps.pubsub.subscribe<RawTicketEvent>(
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
        const raw = queue.shift() as RawTicketEvent;
        const hydrated = await hydrateTicketEvent(raw, deps.prisma);
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

const TicketChangedRef = builder
  .objectRef<Extract<HydratedTicketEvent, { __resolveType: 'TicketChanged' }>>(
    'TicketChanged',
  )
  .implement({
    fields: (t) => ({
      ticket: t.field({
        type: TicketRef,
        resolve: (parent) => parent.ticket as never,
      }),
    }),
  });

const TicketItemChangedRef = builder
  .objectRef<
    Extract<HydratedTicketEvent, { __resolveType: 'TicketItemChanged' }>
  >('TicketItemChanged')
  .implement({
    fields: (t) => ({
      ticketItem: t.field({
        type: TicketItemRef,
        resolve: (parent) => parent.ticketItem as never,
      }),
      ticketId: t.field({
        type: 'UUID',
        resolve: (parent) => parent.ticketId,
      }),
    }),
  });

const DiscountChangedRef = builder
  .objectRef<
    Extract<HydratedTicketEvent, { __resolveType: 'DiscountChanged' }>
  >('DiscountChanged')
  .implement({
    fields: (t) => ({
      discount: t.field({
        type: DiscountRef,
        resolve: (parent) => parent.discount as never,
      }),
      ticketId: t.field({
        type: 'UUID',
        resolve: (parent) => parent.ticketId,
      }),
    }),
  });

const TicketUpdateEventUnion = builder.unionType('TicketUpdateEvent', {
  types: [TicketChangedRef, TicketItemChangedRef, DiscountChangedRef],
  resolveType: (parent) =>
    (parent as HydratedTicketEvent).__resolveType,
});

builder.subscriptionField('ticketUpdates', (t) =>
  t.field({
    type: TicketUpdateEventUnion,
    description:
      "Stream of ticket / item / discount events at the viewer's location. " +
      'Backed by Postgres LISTEN/NOTIFY for cross-instance fan-out, served ' +
      'over GraphQL-over-SSE by graphql-yoga.',
    authScopes: { staff: true },
    subscribe: (_root, _args, ctx) =>
      subscribeToTicketChannel(ctx, {
        pubsub: defaultPubsub,
        prisma: ctx.prisma,
      }),
    resolve: (payload) => payload as never,
  }),
);
