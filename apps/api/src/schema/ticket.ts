import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { builder } from './builder.js';
import {
  ItemCourseEnum,
  OrderTypeEnum,
  TicketItemStatusEnum,
  TicketStatusEnum,
} from './enums.js';

export type TicketRow = {
  id: string;
  locationId: string;
  shortNumber: number;
  businessDay: Date;
  customerLabel: string | null;
  orderType: 'DINE_IN' | 'TAKEOUT';
  status: 'OPEN' | 'CLOSED' | 'VOIDED';
  openedById: string;
  openedAt: Date;
  closedById: string | null;
  closedAt: Date | null;
  voidedById: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  closeNote: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

export type TicketItemRow = {
  id: string;
  ticketId: string;
  menuItemId: string;
  status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  modifiersTotalCents: number;
  lineSubtotalCents: number;
  notes: string | null;
  course: 'APPETIZER' | 'MAIN' | 'DESSERT' | 'SIDE' | 'BEVERAGE' | 'OTHER';
  firedById: string | null;
  firedAt: Date | null;
  readyAt: Date | null;
  servedById: string | null;
  servedAt: Date | null;
  voidedById: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Pure resolver for `Ticket.itemSummary`. Returns "N items: 1 X, 2 Y" using
 * non-voided items, or "0 items" when the ticket has no live items.
 */
export function resolveItemSummary(items: Array<{
  status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
  quantity: number;
  nameSnapshot: string;
}>): string {
  const live = items.filter((i) => i.status !== 'VOIDED');
  const count = live.reduce((acc, i) => acc + i.quantity, 0);
  if (live.length === 0) return '0 items';
  const parts = live.map((i) => `${i.quantity} ${i.nameSnapshot}`);
  return `${count} items: ${parts.join(', ')}`;
}

/**
 * Pure resolver for `TicketItem.effectivePriceAfterDiscountsCents`.
 * Subtracts the sum of non-voided line discount `computedCents` from the
 * line subtotal, clamped to zero.
 */
export function resolveEffectivePriceAfterDiscounts(args: {
  lineSubtotalCents: number;
  discounts: Array<{ computedCents: number; voidedAt: Date | null }>;
}): number {
  const live = args.discounts.filter((d) => d.voidedAt === null);
  const total = live.reduce((acc, d) => acc + d.computedCents, 0);
  return Math.max(0, args.lineSubtotalCents - total);
}

/**
 * Pure resolver for `Query.openTickets`. Throws `ForbiddenError` if the viewer
 * has no resolved location. Returns OPEN tickets ordered by openedAt asc.
 */
export async function resolveOpenTickets(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.ticket.findMany({
    ...query,
    where: { locationId: ctx.auth.location.id, status: 'OPEN' },
    orderBy: { openedAt: 'asc' },
  });
}

/**
 * Pure resolver for `Query.ticket(id)`. Returns the ticket only if it belongs
 * to the viewer's location; otherwise null.
 */
export async function resolveTicketById(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.ticket.findFirst({
    ...query,
    where: { id, locationId: ctx.auth.location.id },
  });
}

/**
 * Sort tickets by their oldest unready (FIRED) item's `firedAt asc`. Tickets
 * with no FIRED items (only READY) are pushed to the end. Stable for ties.
 */
export function sortKitchenTickets(
  rows: Array<TicketRow & { items: Array<{ status: string; firedAt: Date | null }> }>,
): Array<TicketRow & { items: Array<{ status: string; firedAt: Date | null }> }> {
  const withKey = rows.map((t, i) => {
    const fired = t.items
      .filter((it) => it.status === 'FIRED' && it.firedAt !== null)
      .map((it) => (it.firedAt as Date).getTime());
    const minFired = fired.length > 0 ? Math.min(...fired) : Number.POSITIVE_INFINITY;
    return { t, minFired, i };
  });
  withKey.sort((a, b) => a.minFired - b.minFired || a.i - b.i);
  return withKey.map((w) => w.t);
}

/**
 * Pure resolver for `Query.kitchenTickets`. Tickets at the viewer's location
 * with at least one FIRED-or-READY item, ordered by oldest unready item.
 */
export async function resolveKitchenTickets(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const rows = (await ctx.prisma.ticket.findMany({
    ...query,
    where: {
      locationId: ctx.auth.location.id,
      items: { some: { status: { in: ['FIRED', 'READY'] } } },
    },
    include: {
      items: { select: { status: true, firedAt: true } },
    },
  })) as Array<TicketRow & { items: Array<{ status: string; firedAt: Date | null }> }>;
  return sortKitchenTickets(rows);
}

export interface TicketHistoryFilterArgs {
  status?: 'OPEN' | 'CLOSED' | 'VOIDED' | null;
  fromDate?: Date | null;
  toDate?: Date | null;
  serverId?: string | null;
}

/** Build a Prisma where for ticket history listings, scoped to a single location. */
export function buildTicketHistoryWhere(
  locationId: string,
  filter: TicketHistoryFilterArgs | null | undefined,
): Record<string, unknown> {
  const where: Record<string, unknown> = { locationId };
  if (filter?.status) where.status = filter.status;
  if (filter?.serverId) where.openedById = filter.serverId;
  if (filter?.fromDate || filter?.toDate) {
    const range: Record<string, Date> = {};
    if (filter.fromDate) range.gte = filter.fromDate;
    if (filter.toDate) range.lte = filter.toDate;
    where.openedAt = range;
  }
  return where;
}

/** Pure resolver for `Query.ticketHistory` connection. */
export async function resolveTicketHistory(
  query: object,
  ctx: RequestContext,
  filter: TicketHistoryFilterArgs | null | undefined,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(ctx.auth.role)) {
    throw new ForbiddenError('Only managers or above can view ticket history');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const where = buildTicketHistoryWhere(ctx.auth.location.id, filter);
  return ctx.prisma.ticket.findMany({
    ...query,
    where,
    orderBy: { openedAt: 'desc' },
  });
}

/** Pure resolver for `Query.ticketByShortNumber`. */
export async function resolveTicketByShortNumber(
  query: object,
  ctx: RequestContext,
  shortNumber: number,
  businessDay: Date,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.ticket.findFirst({
    ...query,
    where: {
      locationId: ctx.auth.location.id,
      businessDay,
      shortNumber,
    },
  });
}

export const TicketItemModifierRef = builder.prismaObject('TicketItemModifier', {
  fields: (t) => ({
    id: t.exposeID('id'),
    nameSnapshot: t.exposeString('nameSnapshot'),
    priceDeltaCents: t.exposeInt('priceDeltaCents'),
    modifierGroupName: t.exposeString('modifierGroupName'),
    modifier: t.relation('modifier', { authScopes: { staff: true } }),
  }),
});

export const TicketItemRef = builder.prismaObject('TicketItem', {
  fields: (t) => ({
    id: t.exposeID('id'),
    status: t.field({
      type: TicketItemStatusEnum,
      resolve: (parent) => parent.status,
    }),
    nameSnapshot: t.exposeString('nameSnapshot'),
    unitPriceCents: t.exposeInt('unitPriceCents'),
    quantity: t.exposeInt('quantity'),
    modifiersTotalCents: t.exposeInt('modifiersTotalCents'),
    lineSubtotalCents: t.exposeInt('lineSubtotalCents'),
    notes: t.exposeString('notes', { nullable: true }),
    course: t.field({
      type: ItemCourseEnum,
      resolve: (parent) => parent.course,
    }),
    firedAt: t.expose('firedAt', { type: 'DateTime', nullable: true }),
    readyAt: t.expose('readyAt', { type: 'DateTime', nullable: true }),
    servedAt: t.expose('servedAt', { type: 'DateTime', nullable: true }),
    voidedAt: t.expose('voidedAt', { type: 'DateTime', nullable: true }),
    voidReason: t.exposeString('voidReason', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    menuItem: t.relation('menuItem', { authScopes: { staff: true } }),
    modifiers: t.relation('modifiers', {
      authScopes: { staff: true },
      query: { orderBy: { id: 'asc' } },
    }),
    discounts: t.relation('discounts', {
      authScopes: { staff: true },
      query: { orderBy: { appliedAt: 'desc' } },
    }),
    firedBy: t.relation('firedBy', {
      authScopes: { staff: true },
      nullable: true,
    }),
    servedBy: t.relation('servedBy', {
      authScopes: { staff: true },
      nullable: true,
    }),
    voidedBy: t.relation('voidedBy', {
      authScopes: { staff: true },
      nullable: true,
    }),
    effectivePriceAfterDiscountsCents: t.field({
      type: 'Int',
      authScopes: { staff: true },
      resolve: async (parent, _args, ctx) => {
        const row = parent as TicketItemRow;
        const discounts = (await ctx.prisma.discount.findMany({
          where: { ticketItemId: row.id },
          select: { computedCents: true, voidedAt: true },
        })) as Array<{ computedCents: number; voidedAt: Date | null }>;
        return resolveEffectivePriceAfterDiscounts({
          lineSubtotalCents: row.lineSubtotalCents,
          discounts,
        });
      },
    }),
  }),
});

export const TicketRef = builder.prismaObject('Ticket', {
  fields: (t) => ({
    id: t.exposeID('id'),
    shortNumber: t.exposeInt('shortNumber'),
    businessDay: t.expose('businessDay', { type: 'DateTime' }),
    customerLabel: t.exposeString('customerLabel', { nullable: true }),
    orderType: t.field({
      type: OrderTypeEnum,
      resolve: (parent) => parent.orderType,
    }),
    status: t.field({
      type: TicketStatusEnum,
      resolve: (parent) => parent.status,
    }),
    openedAt: t.expose('openedAt', { type: 'DateTime' }),
    closedAt: t.expose('closedAt', { type: 'DateTime', nullable: true }),
    voidedAt: t.expose('voidedAt', { type: 'DateTime', nullable: true }),
    voidReason: t.exposeString('voidReason', { nullable: true }),
    closeNote: t.exposeString('closeNote', { nullable: true }),
    subtotalCents: t.exposeInt('subtotalCents'),
    discountCents: t.exposeInt('discountCents'),
    taxCents: t.exposeInt('taxCents'),
    totalCents: t.exposeInt('totalCents'),
    openedBy: t.relation('openedBy', { authScopes: { staff: true } }),
    closedBy: t.relation('closedBy', {
      authScopes: { staff: true },
      nullable: true,
    }),
    voidedBy: t.relation('voidedBy', {
      authScopes: { staff: true },
      nullable: true,
    }),
    items: t.relation('items', {
      authScopes: { staff: true },
      query: { orderBy: { createdAt: 'asc' } },
    }),
    discounts: t.relation('discounts', {
      authScopes: { staff: true },
      query: { orderBy: { appliedAt: 'desc' } },
    }),
    isLive: t.field({
      type: 'Boolean',
      authScopes: { staff: true },
      resolve: (parent) => (parent as TicketRow).status === 'OPEN',
    }),
    itemSummary: t.field({
      type: 'String',
      authScopes: { staff: true },
      resolve: async (parent, _args, ctx) => {
        const row = parent as TicketRow;
        const items = (await ctx.prisma.ticketItem.findMany({
          where: { ticketId: row.id },
          select: { status: true, quantity: true, nameSnapshot: true },
        })) as Array<{
          status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
          quantity: number;
          nameSnapshot: string;
        }>;
        return resolveItemSummary(items);
      },
    }),
  }),
});

export const TicketHistoryFilter = builder.inputType('TicketHistoryFilter', {
  fields: (t) => ({
    status: t.field({ type: TicketStatusEnum, required: false }),
    fromDate: t.field({ type: 'DateTime', required: false }),
    toDate: t.field({ type: 'DateTime', required: false }),
    serverId: t.field({ type: 'UUID', required: false }),
  }),
});

builder.queryField('openTickets', (t) =>
  t.prismaField({
    type: ['Ticket'],
    description: "All OPEN tickets at the viewer's location, ordered by openedAt asc.",
    authScopes: { staff: true },
    resolve: (query, _root, _args, ctx) => resolveOpenTickets(query, ctx) as never,
  }),
);

builder.queryField('ticket', (t) =>
  t.prismaField({
    type: 'Ticket',
    nullable: true,
    description: "Single ticket by id, scoped to the viewer's location.",
    authScopes: { staff: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveTicketById(query, ctx, args.id as string) as never,
  }),
);

builder.queryField('kitchenTickets', (t) =>
  t.prismaField({
    type: ['Ticket'],
    description:
      "Tickets with at least one FIRED-or-READY item, ordered by oldest unready item.",
    authScopes: { staff: true },
    resolve: (query, _root, _args, ctx) => resolveKitchenTickets(query, ctx) as never,
  }),
);

builder.queryField('ticketHistory', (t) =>
  t.prismaConnection({
    type: 'Ticket',
    cursor: 'id',
    description: "Ticket history at the viewer's location. Requires manager role.",
    authScopes: { manager: true },
    args: { filter: t.arg({ type: TicketHistoryFilter, required: false }) },
    resolve: (query, _root, args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
      const where = buildTicketHistoryWhere(
        ctx.auth.location.id,
        args.filter as TicketHistoryFilterArgs | null | undefined,
      );
      return ctx.prisma.ticket.findMany({
        ...query,
        where,
        orderBy: { openedAt: 'desc' },
      });
    },
    totalCount: (_root, args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
      const where = buildTicketHistoryWhere(
        ctx.auth.location.id,
        args.filter as TicketHistoryFilterArgs | null | undefined,
      );
      return ctx.prisma.ticket.count({ where });
    },
  }),
);

builder.queryField('ticketByShortNumber', (t) =>
  t.prismaField({
    type: 'Ticket',
    nullable: true,
    description:
      "Lookup a ticket by its day-scoped short number at the viewer's location.",
    authScopes: { staff: true },
    args: {
      shortNumber: t.arg({ type: 'Int', required: true }),
      businessDay: t.arg({ type: 'DateTime', required: true }),
    },
    resolve: (query, _root, args, ctx) =>
      resolveTicketByShortNumber(
        query,
        ctx,
        args.shortNumber as number,
        args.businessDay as Date,
      ) as never,
  }),
);
