import type { OnlineOrderRequest, PrismaClient } from '@repo/db';
import type { RequestContext } from '../../context.js';
import { ForbiddenError } from '../../errors.js';
import {
  onlineOrdersChannelName,
  pubsub as defaultPubsub,
} from '../../pubsub.js';
import { builder } from '../builder.js';
import { OnlineOrderRequestRef } from '../online-order-request.js';

export type RawOnlineOrderEvent =
  | { kind: 'OnlineOrderRequestCreated'; requestId: string }
  | { kind: 'OnlineOrderRequestUpdated'; requestId: string };

export type HydratedOnlineOrderEvent =
  | { __resolveType: 'OnlineOrderRequestCreated'; request: OnlineOrderRequest }
  | { __resolveType: 'OnlineOrderRequestUpdated'; request: OnlineOrderRequest };

export interface OnlineOrderChannelDeps {
  pubsub: Pick<typeof defaultPubsub, 'subscribe'>;
  prisma: Pick<PrismaClient, 'onlineOrderRequest'>;
}

/** Hydrate a raw event by reading the referenced request row. */
export async function hydrateOnlineOrderEvent(
  raw: RawOnlineOrderEvent,
  prisma: OnlineOrderChannelDeps['prisma'],
): Promise<HydratedOnlineOrderEvent | null> {
  const request = (await prisma.onlineOrderRequest.findUnique({
    where: { id: raw.requestId },
  })) as OnlineOrderRequest | null;
  if (!request) return null;
  return {
    __resolveType: raw.kind,
    request,
  };
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

/**
 * Async-iterable subscription that bridges Postgres LISTEN/NOTIFY to a
 * per-location stream of online-order events. Pure: dependency-injected pubsub
 * and prisma.
 */
export async function* subscribeToOnlineOrdersChannel(
  ctx: RequestContext,
  deps: OnlineOrderChannelDeps,
): AsyncGenerator<HydratedOnlineOrderEvent, void, void> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can stream online orders');
  }
  if (!ctx.auth.location) {
    throw new ForbiddenError('A location context is required');
  }
  const channel = onlineOrdersChannelName(ctx.auth.location.id);

  const queue: RawOnlineOrderEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;

  const wakeup = (): void => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  const unsubscribe = await deps.pubsub.subscribe<RawOnlineOrderEvent>(
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
        const raw = queue.shift() as RawOnlineOrderEvent;
        const hydrated = await hydrateOnlineOrderEvent(raw, deps.prisma);
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
      // best-effort
    }
  }
}

const OnlineOrderCreatedRef = builder
  .objectRef<
    Extract<HydratedOnlineOrderEvent, { __resolveType: 'OnlineOrderRequestCreated' }>
  >('OnlineOrderRequestCreated')
  .implement({
    fields: (t) => ({
      request: t.field({
        type: OnlineOrderRequestRef,
        resolve: (parent) => parent.request as never,
      }),
    }),
  });

const OnlineOrderUpdatedRef = builder
  .objectRef<
    Extract<HydratedOnlineOrderEvent, { __resolveType: 'OnlineOrderRequestUpdated' }>
  >('OnlineOrderRequestUpdated')
  .implement({
    fields: (t) => ({
      request: t.field({
        type: OnlineOrderRequestRef,
        resolve: (parent) => parent.request as never,
      }),
    }),
  });

const OnlineOrderRequestEventUnion = builder.unionType('OnlineOrderRequestEvent', {
  types: [OnlineOrderCreatedRef, OnlineOrderUpdatedRef],
  resolveType: (parent) =>
    (parent as HydratedOnlineOrderEvent).__resolveType,
});

builder.subscriptionField('onlineOrderRequests', (t) =>
  t.field({
    type: OnlineOrderRequestEventUnion,
    description:
      "Stream of online-order events at the viewer's location. Backed by Postgres LISTEN/NOTIFY.",
    authScopes: { staff: true },
    subscribe: (_root, _args, ctx) =>
      subscribeToOnlineOrdersChannel(ctx, {
        pubsub: defaultPubsub,
        prisma: ctx.prisma,
      }),
    resolve: (payload) => payload as never,
  }),
);
