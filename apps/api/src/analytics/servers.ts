import type { TicketStatus } from './summary.js';
import type { RawLineStatus } from './top-items.js';

export interface ServerInputTicket {
  openedById: string;
  openedByName: string;
  totalCents: number;
  status: TicketStatus;
  items: Array<{ status: RawLineStatus; servedById: string | null }>;
}

export interface ServerPerfRow {
  openedById: string;
  openedByName: string;
  ticketCount: number;
  itemsServed: number;
  revenueCents: number;
  averageTicketCents: number;
  voidRate: number;
}

interface Acc {
  openedById: string;
  openedByName: string;
  ticketCount: number;
  revenueCents: number;
  itemsServed: number;
  totalLines: number;
  voidedLines: number;
}

export function computeServerPerformance(args: { tickets: ServerInputTicket[] }): ServerPerfRow[] {
  const byUser = new Map<string, Acc>();

  for (const ticket of args.tickets) {
    let acc = byUser.get(ticket.openedById);
    if (!acc) {
      acc = {
        openedById: ticket.openedById,
        openedByName: ticket.openedByName,
        ticketCount: 0,
        revenueCents: 0,
        itemsServed: 0,
        totalLines: 0,
        voidedLines: 0,
      };
      byUser.set(ticket.openedById, acc);
    }

    if (ticket.status === 'CLOSED') {
      acc.ticketCount += 1;
      acc.revenueCents += ticket.totalCents;
    }

    for (const item of ticket.items) {
      acc.totalLines += 1;
      if (item.status === 'VOIDED') {
        acc.voidedLines += 1;
        continue;
      }
      if (item.servedById === ticket.openedById) {
        acc.itemsServed += 1;
      }
    }
  }

  return Array.from(byUser.values()).map((a) => ({
    openedById: a.openedById,
    openedByName: a.openedByName,
    ticketCount: a.ticketCount,
    itemsServed: a.itemsServed,
    revenueCents: a.revenueCents,
    averageTicketCents: a.ticketCount > 0 ? Math.round(a.revenueCents / a.ticketCount) : 0,
    voidRate: a.totalLines > 0 ? a.voidedLines / a.totalLines : 0,
  }));
}
