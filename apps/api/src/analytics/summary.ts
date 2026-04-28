export type TicketStatus = 'OPEN' | 'CLOSED' | 'VOIDED';

export interface SummaryTicket {
  status: TicketStatus;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  guestId: string | null;
}

export interface SalesSummaryRow {
  ticketCount: number;
  closedTicketCount: number;
  voidedTicketCount: number;
  grossSalesCents: number;
  discountCents: number;
  taxCents: number;
  netSalesCents: number;
  averageTicketCents: number;
  uniqueGuests: number;
}

export function computeSalesSummary(args: { tickets: SummaryTicket[] }): SalesSummaryRow {
  let closedTicketCount = 0;
  let voidedTicketCount = 0;
  let grossSalesCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  let netSalesCents = 0;
  const guestIds = new Set<string>();

  for (const t of args.tickets) {
    if (t.status === 'VOIDED') {
      voidedTicketCount += 1;
      continue;
    }
    if (t.status !== 'CLOSED') continue;
    closedTicketCount += 1;
    grossSalesCents += t.subtotalCents;
    discountCents += t.discountCents;
    taxCents += t.taxCents;
    netSalesCents += t.totalCents;
    if (t.guestId !== null) guestIds.add(t.guestId);
  }

  const averageTicketCents = closedTicketCount > 0 ? Math.round(netSalesCents / closedTicketCount) : 0;

  return {
    ticketCount: args.tickets.length,
    closedTicketCount,
    voidedTicketCount,
    grossSalesCents,
    discountCents,
    taxCents,
    netSalesCents,
    averageTicketCents,
    uniqueGuests: guestIds.size,
  };
}
