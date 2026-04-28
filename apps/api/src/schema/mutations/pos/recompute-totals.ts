import type { PrismaClient } from '@repo/db';
import { computeTicketTotalsCents } from '../../../order/pricing.js';

/**
 * Live totals recompute used by line/discount mutations. Tax is set to zero —
 * tax is finalized only at close (see close-ticket.ts).
 *
 * Reads all ticket items + non-voided discounts, then writes back the four
 * totals fields on the ticket row. Caller owns transactional context.
 */
export async function recomputeTicketTotalsLive(args: {
  prisma: Pick<PrismaClient, 'ticketItem' | 'discount' | 'ticket'>;
  ticketId: string;
}): Promise<void> {
  const items = (await args.prisma.ticketItem.findMany({
    where: { ticketId: args.ticketId },
    select: { id: true, status: true, lineSubtotalCents: true },
  })) as Array<{
    id: string;
    status: 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';
    lineSubtotalCents: number;
  }>;
  const discounts = (await args.prisma.discount.findMany({
    where: {
      voidedAt: null,
      OR: [
        { ticketId: args.ticketId },
        { ticketItem: { ticketId: args.ticketId } },
      ],
    },
    select: { ticketId: true, ticketItemId: true, computedCents: true },
  })) as Array<{
    ticketId: string | null;
    ticketItemId: string | null;
    computedCents: number;
  }>;
  const lineDiscountByItem = new Map<string, number>();
  let ticketDiscountCents = 0;
  for (const d of discounts) {
    if (d.ticketItemId) {
      lineDiscountByItem.set(
        d.ticketItemId,
        (lineDiscountByItem.get(d.ticketItemId) ?? 0) + d.computedCents,
      );
    } else if (d.ticketId) {
      ticketDiscountCents += d.computedCents;
    }
  }
  const totals = computeTicketTotalsCents({
    items: items.map((i) => ({
      lineSubtotalCents: i.lineSubtotalCents,
      lineDiscountCents: lineDiscountByItem.get(i.id) ?? 0,
      status: i.status,
    })),
    ticketDiscountCents,
    taxRatePermille: 0,
  });
  await args.prisma.ticket.update({
    where: { id: args.ticketId },
    data: {
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
  });
}

/**
 * Pure helper: validate that selected modifier IDs satisfy each attached
 * group's min/max selections. Returns an array of group names that violate.
 */
export function findModifierGroupViolations(args: {
  attachedGroups: Array<{ id: string; name: string; minSelections: number; maxSelections: number }>;
  selectedByGroupId: Map<string, number>;
}): string[] {
  const violations: string[] = [];
  for (const g of args.attachedGroups) {
    const count = args.selectedByGroupId.get(g.id) ?? 0;
    if (count < g.minSelections || count > g.maxSelections) {
      violations.push(g.name);
    }
  }
  return violations;
}
