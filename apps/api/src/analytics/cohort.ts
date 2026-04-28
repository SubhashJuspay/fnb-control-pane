export interface GuestVisit {
  guestId: string;
  ticketClosedAt: Date;
}

export interface GuestCohortRow {
  newGuestCount: number;
  returningGuestCount: number;
  repeatRate: number;
}

/**
 * `New` = guests whose earliest visit ever is within `[range.from, range.to)`.
 * `Returning` = guests with a visit before `range.from` AND a visit in
 * `[range.from, range.to)`.
 * Guests with no visit inside the range are excluded.
 */
export function computeGuestCohort(args: {
  guestVisits: GuestVisit[];
  range: { from: Date; to: Date };
}): GuestCohortRow {
  const fromMs = args.range.from.getTime();
  const toMs = args.range.to.getTime();

  // Per guest, track earliest visit and any visit within range.
  const earliestByGuest = new Map<string, number>();
  const inRangeByGuest = new Map<string, boolean>();

  for (const v of args.guestVisits) {
    const ms = v.ticketClosedAt.getTime();
    const prior = earliestByGuest.get(v.guestId);
    if (prior === undefined || ms < prior) {
      earliestByGuest.set(v.guestId, ms);
    }
    if (ms >= fromMs && ms < toMs) {
      inRangeByGuest.set(v.guestId, true);
    }
  }

  let newGuestCount = 0;
  let returningGuestCount = 0;
  for (const [guestId, hasInRange] of inRangeByGuest) {
    if (!hasInRange) continue;
    const earliest = earliestByGuest.get(guestId)!;
    if (earliest >= fromMs) newGuestCount += 1;
    else returningGuestCount += 1;
  }

  const total = newGuestCount + returningGuestCount;
  const repeatRate = total > 0 ? returningGuestCount / total : 0;

  return { newGuestCount, returningGuestCount, repeatRate };
}
