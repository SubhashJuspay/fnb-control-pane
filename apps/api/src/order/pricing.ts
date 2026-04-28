import type { TicketItemStatus } from '@repo/validation/ticket';

export function computeLineSubtotalCents(args: {
  unitPriceCents: number;
  quantity: number;
  modifiers: Array<{ priceDeltaCents: number }>;
}): { modifiersTotalCents: number; lineSubtotalCents: number } {
  const modifiersTotalCents = args.modifiers.reduce((acc, m) => acc + m.priceDeltaCents, 0);
  const lineSubtotalCents = (args.unitPriceCents + modifiersTotalCents) * args.quantity;
  return { modifiersTotalCents, lineSubtotalCents };
}

export function computeTicketTotalsCents(args: {
  items: Array<{ lineSubtotalCents: number; lineDiscountCents: number; status: TicketItemStatus }>;
  ticketDiscountCents: number;
  taxRatePermille: number;
}): { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number } {
  const liveItems = args.items.filter((i) => i.status !== 'VOIDED');
  const subtotalCents = liveItems.reduce((acc, i) => acc + i.lineSubtotalCents, 0);
  const lineDiscountTotal = liveItems.reduce((acc, i) => acc + i.lineDiscountCents, 0);
  const discountCents = lineDiscountTotal + args.ticketDiscountCents;
  const netCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round((netCents * args.taxRatePermille) / 10_000);
  const totalCents = netCents + taxCents;
  return { subtotalCents, discountCents, taxCents, totalCents };
}
