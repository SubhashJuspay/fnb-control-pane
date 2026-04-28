export type TopItemsSortBy = 'QUANTITY' | 'REVENUE' | 'TICKETS';

export type RawLineStatus = 'NEW' | 'FIRED' | 'READY' | 'SERVED' | 'VOIDED';

export interface RawLine {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  lineSubtotalCents: number;
  lineDiscountCents: number;
  ticketId: string;
  status: RawLineStatus;
}

export interface TopItemRow {
  menuItemId: string;
  menuItemName: string;
  quantitySold: number;
  revenueCents: number;
  ticketCount: number;
}

export function computeTopItems(args: {
  lines: RawLine[];
  limit: number;
  by: TopItemsSortBy;
}): TopItemRow[] {
  const byItem = new Map<string, { row: TopItemRow; ticketIds: Set<string> }>();
  for (const line of args.lines) {
    if (line.status === 'VOIDED') continue;
    const existing = byItem.get(line.menuItemId);
    const revenue = line.lineSubtotalCents - line.lineDiscountCents;
    if (existing) {
      existing.row.quantitySold += line.quantity;
      existing.row.revenueCents += revenue;
      existing.ticketIds.add(line.ticketId);
      existing.row.ticketCount = existing.ticketIds.size;
    } else {
      const ticketIds = new Set<string>([line.ticketId]);
      byItem.set(line.menuItemId, {
        row: {
          menuItemId: line.menuItemId,
          menuItemName: line.menuItemName,
          quantitySold: line.quantity,
          revenueCents: revenue,
          ticketCount: 1,
        },
        ticketIds,
      });
    }
  }

  const rows = Array.from(byItem.values()).map((v) => v.row);
  const sortKey: keyof TopItemRow =
    args.by === 'QUANTITY' ? 'quantitySold' : args.by === 'REVENUE' ? 'revenueCents' : 'ticketCount';
  rows.sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  return rows.slice(0, args.limit);
}
