import { formatInTimeZone } from 'date-fns-tz';

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

const ISO_INDEX_TO_DAY: ReadonlyArray<DayOfWeek> = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export interface DayOfWeekBucket {
  dayOfWeek: DayOfWeek;
  ticketCount: number;
  revenueCents: number;
}

export function computeDayOfWeekMix(args: {
  tickets: Array<{ closedAt: Date | null; totalCents: number }>;
  timezone: string;
}): DayOfWeekBucket[] {
  const buckets: DayOfWeekBucket[] = ISO_INDEX_TO_DAY.map((d) => ({
    dayOfWeek: d,
    ticketCount: 0,
    revenueCents: 0,
  }));

  for (const t of args.tickets) {
    if (t.closedAt === null) continue;
    // 'i' = ISO day-of-week 1..7 (MON=1, SUN=7).
    const iso = Number(formatInTimeZone(t.closedAt, args.timezone, 'i'));
    if (!Number.isFinite(iso) || iso < 1 || iso > 7) continue;
    const bucket = buckets[iso - 1]!;
    bucket.ticketCount += 1;
    bucket.revenueCents += t.totalCents;
  }

  return buckets;
}
