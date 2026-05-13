import type { OnlineOrderRequest as OnlineOrderRequestRow, PrismaClient } from '@repo/db';
import { trackOnlineOrderSchema } from '@repo/validation/online-order';
import { z } from 'zod';
import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { estimateReadyAt } from '../online-orders/estimate.js';
import { hashTrackingToken } from '../online-orders/tracking-token.js';
import { builder } from './builder.js';
import {
  OnlineOrderConfirmStatusEnum,
  OnlinePickupKindEnum,
  TicketStatusEnum,
} from './enums.js';

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export interface OnlineOrderTrackingItem {
  nameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  modifiersTotalCents: number;
  lineSubtotalCents: number;
  status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
  modifiers: Array<{ nameSnapshot: string; priceDeltaCents: number }>;
}

export interface OnlineOrderTrackingProjection {
  shortNumber: number;
  customerName: string;
  pickupAt: Date;
  pickupKind: 'ASAP' | 'SCHEDULED';
  confirmStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  ticketStatus: 'OPEN' | 'CLOSED' | 'VOIDED';
  itemSummary: string;
  totalCents: number;
  taxCents: number;
  subtotalCents: number;
  tipCents: number;
  estimatedReadyAt: Date | null;
  rejectReason: string | null;
  isReady: boolean;
  items: OnlineOrderTrackingItem[];
  tenantName: string;
  locationName: string;
  locationAddress: unknown | null;
  locationPhone: string | null;
  closedAt: Date | null;
}

export interface OnlineOrderFilterArgs {
  status?: 'PENDING' | 'CONFIRMED' | 'REJECTED' | null;
  fromDate?: Date | null;
  toDate?: Date | null;
}

/** Pure helper: build a Prisma where clause for the staff inbox query. */
export function buildOnlineOrderWhere(
  locationId: string,
  filter: OnlineOrderFilterArgs | null | undefined,
): Record<string, unknown> {
  const where: Record<string, unknown> = { locationId };
  if (filter?.status) where.confirmStatus = filter.status;
  if (filter?.fromDate || filter?.toDate) {
    const range: Record<string, Date> = {};
    if (filter.fromDate) range.gte = filter.fromDate;
    if (filter.toDate) range.lte = filter.toDate;
    where.createdAt = range;
  }
  return where;
}

/**
 * Pure helper: produce a sanitized projection for the public tracking endpoint.
 * Reads ticket + items + online request rows the caller has already loaded.
 */
export function projectOnlineOrderTracking(args: {
  request: Pick<
    OnlineOrderRequestRow,
    | 'customerName'
    | 'pickupAt'
    | 'pickupKind'
    | 'confirmStatus'
    | 'confirmedAt'
    | 'rejectReason'
  >;
  ticket: {
    shortNumber: number;
    status: 'OPEN' | 'CLOSED' | 'VOIDED';
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    tipCents: number;
    closedAt: Date | null;
  };
  items: Array<{
    quantity: number;
    nameSnapshot: string;
    unitPriceCents: number;
    modifiersTotalCents: number;
    lineSubtotalCents: number;
    status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
    modifiers?: Array<{ nameSnapshot: string; priceDeltaCents: number }>;
  }>;
  tenantName: string;
  locationName: string;
  locationAddress: unknown | null;
  locationPhone: string | null;
}): OnlineOrderTrackingProjection {
  const live = args.items.filter((i) => i.status !== 'VOIDED');
  const itemSummary =
    live.length === 0
      ? '0 items'
      : live.map((i) => `${i.quantity} ${i.nameSnapshot}`).join(', ');
  const isReady =
    live.length > 0 && live.every((i) => i.status === 'READY' || i.status === 'SERVED');
  const estimated =
    args.request.confirmStatus === 'CONFIRMED' && args.request.confirmedAt
      ? estimateReadyAt({
          pickupAt: args.request.pickupAt,
          confirmedAt: args.request.confirmedAt,
        })
      : null;
  return {
    shortNumber: args.ticket.shortNumber,
    customerName: args.request.customerName,
    pickupAt: args.request.pickupAt,
    pickupKind: args.request.pickupKind,
    confirmStatus: args.request.confirmStatus,
    ticketStatus: args.ticket.status,
    itemSummary,
    totalCents: args.ticket.totalCents,
    taxCents: args.ticket.taxCents,
    subtotalCents: args.ticket.subtotalCents,
    tipCents: args.ticket.tipCents,
    estimatedReadyAt: estimated,
    rejectReason: args.request.rejectReason,
    isReady,
    items: args.items.map((i) => ({
      nameSnapshot: i.nameSnapshot,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      modifiersTotalCents: i.modifiersTotalCents,
      lineSubtotalCents: i.lineSubtotalCents,
      status: i.status,
      modifiers: i.modifiers ?? [],
    })),
    tenantName: args.tenantName,
    locationName: args.locationName,
    locationAddress: args.locationAddress,
    locationPhone: args.locationPhone,
    closedAt: args.ticket.closedAt,
  };
}

/** Pure resolver for `Query.onlineOrderRequests`. Staff scope, location-scoped. */
export async function resolveOnlineOrderRequests(
  query: object,
  ctx: RequestContext,
  filter: OnlineOrderFilterArgs | null | undefined,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can view online orders');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const where = buildOnlineOrderWhere(ctx.auth.location.id, filter);
  return ctx.prisma.onlineOrderRequest.findMany({
    ...query,
    where,
    orderBy: { createdAt: 'desc' },
  });
}

/** Pure resolver for `Query.onlineOrderRequest(id)`. Staff scope. */
export async function resolveOnlineOrderRequestById(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can view online orders');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.onlineOrderRequest.findFirst({
    ...query,
    where: { id, locationId: ctx.auth.location.id },
  });
}

/** Pure resolver for `Query.trackOnlineOrder(token)`. Anonymous. */
export async function resolveTrackOnlineOrder(
  prisma: Pick<PrismaClient, 'onlineOrderRequest' | 'ticket' | 'ticketItem'>,
  token: string,
): Promise<OnlineOrderTrackingProjection | null> {
  const tokenHash = hashTrackingToken(token);
  const request = await prisma.onlineOrderRequest.findUnique({
    where: { trackingTokenHash: tokenHash },
    select: {
      ticketId: true,
      customerName: true,
      pickupAt: true,
      pickupKind: true,
      confirmStatus: true,
      confirmedAt: true,
      rejectReason: true,
    },
  });
  if (!request) return null;
  const ticket = (await prisma.ticket.findUnique({
    where: { id: request.ticketId },
    select: {
      shortNumber: true,
      status: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
      tipCents: true,
      closedAt: true,
      location: {
        select: {
          name: true,
          phone: true,
          address: true,
          tenant: { select: { name: true } },
        },
      },
    },
  })) as
    | {
        shortNumber: number;
        status: 'OPEN' | 'CLOSED' | 'VOIDED';
        subtotalCents: number;
        taxCents: number;
        totalCents: number;
        tipCents: number;
        closedAt: Date | null;
        location: {
          name: string;
          phone: string | null;
          address: unknown;
          tenant: { name: string };
        };
      }
    | null;
  if (!ticket) return null;
  const items = (await prisma.ticketItem.findMany({
    where: { ticketId: request.ticketId },
    select: {
      quantity: true,
      nameSnapshot: true,
      status: true,
      unitPriceCents: true,
      modifiersTotalCents: true,
      lineSubtotalCents: true,
      modifiers: {
        select: { nameSnapshot: true, priceDeltaCents: true },
      },
    },
  })) as Array<{
    quantity: number;
    nameSnapshot: string;
    unitPriceCents: number;
    modifiersTotalCents: number;
    lineSubtotalCents: number;
    status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
    modifiers: Array<{ nameSnapshot: string; priceDeltaCents: number }>;
  }>;
  return projectOnlineOrderTracking({
    request,
    ticket,
    items,
    tenantName: ticket.location.tenant.name,
    locationName: ticket.location.name,
    locationAddress: ticket.location.address ?? null,
    locationPhone: ticket.location.phone ?? null,
  });
}

// ─── GraphQL types ────────────────────────────────────────────────

export const OnlineOrderRequestRef = builder.prismaObject('OnlineOrderRequest', {
  fields: (t) => ({
    id: t.exposeID('id'),
    customerName: t.exposeString('customerName'),
    customerPhone: t.exposeString('customerPhone'),
    customerEmail: t.exposeString('customerEmail', { nullable: true }),
    pickupAt: t.expose('pickupAt', { type: 'DateTime' }),
    pickupKind: t.field({
      type: OnlinePickupKindEnum,
      resolve: (parent) => parent.pickupKind,
    }),
    notes: t.exposeString('notes', { nullable: true }),
    confirmStatus: t.field({
      type: OnlineOrderConfirmStatusEnum,
      resolve: (parent) => parent.confirmStatus,
    }),
    confirmedAt: t.expose('confirmedAt', { type: 'DateTime', nullable: true }),
    rejectedAt: t.expose('rejectedAt', { type: 'DateTime', nullable: true }),
    rejectReason: t.exposeString('rejectReason', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    ticket: t.relation('ticket', { authScopes: { staff: true } }),
    confirmedBy: t.relation('confirmedBy', {
      authScopes: { staff: true },
      nullable: true,
    }),
    rejectedBy: t.relation('rejectedBy', {
      authScopes: { staff: true },
      nullable: true,
    }),
  }),
});

const OnlineOrderTrackingItemRef = builder.objectRef<{
  nameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  modifiersTotalCents: number;
  lineSubtotalCents: number;
  status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
  modifiers: Array<{ nameSnapshot: string; priceDeltaCents: number }>;
}>('OnlineOrderTrackingItem');

const OnlineOrderTrackingItemModifierRef = builder.objectRef<{
  nameSnapshot: string;
  priceDeltaCents: number;
}>('OnlineOrderTrackingItemModifier');

OnlineOrderTrackingItemModifierRef.implement({
  fields: (t) => ({
    nameSnapshot: t.exposeString('nameSnapshot'),
    priceDeltaCents: t.exposeInt('priceDeltaCents'),
  }),
});

OnlineOrderTrackingItemRef.implement({
  fields: (t) => ({
    nameSnapshot: t.exposeString('nameSnapshot'),
    quantity: t.exposeInt('quantity'),
    unitPriceCents: t.exposeInt('unitPriceCents'),
    modifiersTotalCents: t.exposeInt('modifiersTotalCents'),
    lineSubtotalCents: t.exposeInt('lineSubtotalCents'),
    status: t.exposeString('status'),
    modifiers: t.field({
      type: [OnlineOrderTrackingItemModifierRef],
      resolve: (p) => p.modifiers,
    }),
  }),
});

const OnlineOrderTrackingRef = builder.objectRef<OnlineOrderTrackingProjection>(
  'OnlineOrderTracking',
);
OnlineOrderTrackingRef.implement({
  description:
    'Public, sanitized projection of an online order request used by the customer-facing tracking page.',
  fields: (t) => ({
    shortNumber: t.exposeInt('shortNumber'),
    customerName: t.exposeString('customerName'),
    pickupAt: t.expose('pickupAt', { type: 'DateTime' }),
    pickupKind: t.field({
      type: OnlinePickupKindEnum,
      resolve: (p) => p.pickupKind,
    }),
    confirmStatus: t.field({
      type: OnlineOrderConfirmStatusEnum,
      resolve: (p) => p.confirmStatus,
    }),
    ticketStatus: t.field({
      type: TicketStatusEnum,
      resolve: (p) => p.ticketStatus,
    }),
    itemSummary: t.exposeString('itemSummary'),
    totalCents: t.exposeInt('totalCents'),
    taxCents: t.exposeInt('taxCents'),
    subtotalCents: t.exposeInt('subtotalCents'),
    tipCents: t.exposeInt('tipCents'),
    estimatedReadyAt: t.expose('estimatedReadyAt', {
      type: 'DateTime',
      nullable: true,
    }),
    rejectReason: t.exposeString('rejectReason', { nullable: true }),
    isReady: t.exposeBoolean('isReady'),
    items: t.field({
      type: [OnlineOrderTrackingItemRef],
      resolve: (p) => p.items,
    }),
    tenantName: t.exposeString('tenantName'),
    locationName: t.exposeString('locationName'),
    locationPhone: t.exposeString('locationPhone', { nullable: true }),
    locationAddress: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (p) => p.locationAddress ?? null,
    }),
    closedAt: t.expose('closedAt', { type: 'DateTime', nullable: true }),
  }),
});

export const OnlineOrderFilter = builder.inputType('OnlineOrderFilter', {
  fields: (t) => ({
    status: t.field({ type: OnlineOrderConfirmStatusEnum, required: false }),
    fromDate: t.field({ type: 'DateTime', required: false }),
    toDate: t.field({ type: 'DateTime', required: false }),
  }),
});

builder.queryField('onlineOrderRequests', (t) =>
  t.prismaField({
    type: ['OnlineOrderRequest'],
    description:
      "Online order requests at the viewer's location. Staff scope; sorted by createdAt desc.",
    authScopes: { staff: true },
    args: { filter: t.arg({ type: OnlineOrderFilter, required: false }) },
    resolve: (query, _root, args, ctx) =>
      resolveOnlineOrderRequests(
        query,
        ctx,
        args.filter as OnlineOrderFilterArgs | null | undefined,
      ) as never,
  }),
);

builder.queryField('onlineOrderRequest', (t) =>
  t.prismaField({
    type: 'OnlineOrderRequest',
    nullable: true,
    description:
      "Single online order request by id, scoped to the viewer's location.",
    authScopes: { staff: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveOnlineOrderRequestById(query, ctx, args.id as string) as never,
  }),
);

builder.queryField('trackOnlineOrder', (t) =>
  t.field({
    type: OnlineOrderTrackingRef,
    nullable: true,
    description:
      'Public, anonymous tracking lookup. Returns sanitized projection or null.',
    args: { token: t.arg.string({ required: true }) },
    validate: { schema: z.object({ token: trackOnlineOrderSchema.shape.token }) },
    resolve: async (_root, args, ctx) =>
      resolveTrackOnlineOrder(ctx.prisma, args.token as string),
  }),
);
