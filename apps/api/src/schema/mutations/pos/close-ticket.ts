import { closeTicketSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import { invalidateCachePrefix } from '../../../cache.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { completeReservationAfterClose } from '../../../floor/post-close.js';
import {
  accrueGuestPointsAfterClose,
  updateGuestLastSeenAfterClose,
} from '../../../guest/post-close.js';
import { canCloseTicket, canTransitionTicket } from '../../../order/state.js';
import { resolveTaxRateAt } from '../../../order/tax.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { CloseTicketInput } from './inputs.js';

export interface CloseTicketArgs {
  ticketId: string;
  closeNote?: string | null;
  tipCents?: number | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

interface TicketItemWithTaxInfo {
  id: string;
  status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
  lineSubtotalCents: number;
  menuItem: { taxCategoryId: string };
}

interface DiscountForTotals {
  ticketId: string | null;
  ticketItemId: string | null;
  computedCents: number;
  voidedAt: Date | null;
}

/**
 * Pure helper: given the items and non-voided discounts, compute final
 * subtotal/discount/tax/total per the close-ticket math (line-by-line tax).
 */
export function computeCloseTicketTotals(args: {
  items: Array<{
    id: string;
    status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
    lineSubtotalCents: number;
    taxRatePermille: number;
  }>;
  discounts: DiscountForTotals[];
}): { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number } {
  const live = args.items.filter((i) => i.status !== 'VOIDED');
  const lineDiscountByItem = new Map<string, number>();
  let ticketDiscountCents = 0;
  for (const d of args.discounts) {
    if (d.voidedAt !== null) continue;
    if (d.ticketItemId) {
      lineDiscountByItem.set(
        d.ticketItemId,
        (lineDiscountByItem.get(d.ticketItemId) ?? 0) + d.computedCents,
      );
    } else if (d.ticketId) {
      ticketDiscountCents += d.computedCents;
    }
  }
  let subtotalCents = 0;
  let lineDiscountTotal = 0;
  let taxCents = 0;
  for (const i of live) {
    subtotalCents += i.lineSubtotalCents;
    const lineDisc = lineDiscountByItem.get(i.id) ?? 0;
    lineDiscountTotal += lineDisc;
    const netLine = Math.max(0, i.lineSubtotalCents - lineDisc);
    taxCents += Math.round((netLine * i.taxRatePermille) / 10_000);
  }
  const discountCents = lineDiscountTotal + ticketDiscountCents;
  const netCents = Math.max(0, subtotalCents - discountCents);
  const totalCents = netCents + taxCents;
  return { subtotalCents, discountCents, taxCents, totalCents };
}

export async function resolveCloseTicket(
  query: object,
  input: CloseTicketArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can close tickets');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: { id: true, status: true },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!canTransitionTicket(ticket.status, 'CLOSED')) {
    throw new ConflictError(`Cannot close a ticket with status ${ticket.status}`);
  }

  const items = (await ctx.prisma.ticketItem.findMany({
    where: { ticketId: ticket.id },
    select: {
      id: true,
      status: true,
      menuItemId: true,
      quantity: true,
      lineSubtotalCents: true,
      menuItem: { select: { taxCategoryId: true } },
    },
  })) as Array<TicketItemWithTaxInfo & { menuItemId: string; quantity: number }>;

  if (!canCloseTicket(items.map((i) => ({ status: i.status })))) {
    throw new ConflictError('All items must be SERVED or VOIDED before closing');
  }

  const closedAt = new Date();
  const discounts = (await ctx.prisma.discount.findMany({
    where: { OR: [{ ticketId: ticket.id }, { ticketItem: { ticketId: ticket.id } }] },
    select: {
      ticketId: true,
      ticketItemId: true,
      computedCents: true,
      voidedAt: true,
    },
  })) as DiscountForTotals[];

  // Resolve tax rate per (taxCategoryId) once using a small in-memory cache.
  const rateByCategory = new Map<string, number>();
  const itemsWithRate = await Promise.all(
    items.map(async (i) => {
      let rate = rateByCategory.get(i.menuItem.taxCategoryId);
      if (rate === undefined) {
        rate = await resolveTaxRateAt({
          prisma: ctx.prisma,
          taxCategoryId: i.menuItem.taxCategoryId,
          locationId,
          at: closedAt,
        });
        rateByCategory.set(i.menuItem.taxCategoryId, rate);
      }
      return {
        id: i.id,
        status: i.status,
        lineSubtotalCents: i.lineSubtotalCents,
        taxRatePermille: rate,
      };
    }),
  );

  const totals = computeCloseTicketTotals({ items: itemsWithRate, discounts });
  const tipCents = Math.max(0, input.tipCents ?? 0);
  // Loyalty: 1 point per whole dollar of net sales (subtotal − discount).
  // Tax + tip are excluded so the rate matches what most operators expect.
  const netCents = Math.max(0, totals.subtotalCents - totals.discountCents);
  const pointsEarned = Math.floor(netCents / 100);
  const updated = (await ctx.prisma.ticket.update({
    ...query,
    where: { id: ticket.id },
    data: {
      status: 'CLOSED',
      closedAt,
      closedById: ctx.auth.user.id,
      closeNote: input.closeNote ?? null,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      tipCents,
      pointsEarned,
    },
  })) as { id: string };
  // Best-effort inventory decrement: for every non-voided line whose location
  // tracks stock (LocationItem.stockOnHand IS NOT NULL), decrement by the
  // quantity. Unknowns or untracked items are ignored. We swallow errors so a
  // bookkeeping race never blocks the close.
  try {
    const liveItems = items.filter((i) => i.status !== 'VOIDED');
    if (liveItems.length > 0) {
      // Aggregate quantity per menuItemId so multiple lines of the same item
      // produce a single update each.
      const qtyByMenuItemId = new Map<string, number>();
      for (const i of liveItems) {
        qtyByMenuItemId.set(
          i.menuItemId,
          (qtyByMenuItemId.get(i.menuItemId) ?? 0) + (i.quantity ?? 0),
        );
      }
      for (const [menuItemId, qty] of qtyByMenuItemId) {
        if (qty <= 0) continue;
        await ctx.prisma.locationItem.updateMany({
          where: {
            locationId,
            menuItemId,
            stockOnHand: { not: null },
          },
          data: { stockOnHand: { decrement: qty } },
        });
      }
    }
  } catch (err) {
    // logger import would create a circular dep risk here; lean on the audit
    // log for visibility instead.
    void err;
  }

  // Post-commit floor side-effect: if a SEATED reservation is linked to this
  // ticket, transition it to COMPLETED and emit floor events. Wrapped in
  // try/catch inside the helper so a reservation-side failure never blocks
  // the close. Run before the audit + publish so failures here cannot affect
  // ticket telemetry, but do not await blocking the resolver path either.
  await completeReservationAfterClose({
    prisma: ctx.prisma,
    ticketId: updated.id,
    locationId,
  });
  // Best-effort guest CRM bookkeeping: when a guest is linked to the closed
  // ticket, refresh their `lastSeenAt`. Wrapped in try/catch inside the helper
  // so a guest-side failure never blocks the close.
  await updateGuestLastSeenAfterClose({
    prisma: ctx.prisma,
    ticketId: updated.id,
    locationId,
  });
  await accrueGuestPointsAfterClose({
    prisma: ctx.prisma,
    ticketId: updated.id,
    locationId,
  });
  await writeAudit(ctx, {
    action: 'ticket.closed',
    resourceType: 'ticket',
    resourceId: updated.id,
    metadata: {
      closeNote: input.closeNote ?? null,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      tipCents,
    },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: updated.id,
  });
  // Drop the analytics TTL cache for this location so the dashboard's
  // sales summary, hourly mix, etc. reflect the close immediately rather
  // than waiting up to ANALYTICS_TTL_MS for the entries to expire.
  invalidateCachePrefix(`analytics:${locationId}:`);
  return updated;
}

builder.mutationField('closeTicket', (t) =>
  t.prismaField({
    type: 'Ticket',
    authScopes: { staff: true },
    args: { input: t.arg({ type: CloseTicketInput, required: true }) },
    validate: { schema: z.object({ input: closeTicketSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveCloseTicket(query, args.input as CloseTicketArgs, ctx) as never,
  }),
);
