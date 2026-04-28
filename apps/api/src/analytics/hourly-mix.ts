import { formatInTimeZone } from 'date-fns-tz';

export interface HourlyBucket {
  hour: number;
  ticketCount: number;
  revenueCents: number;
}

export function computeHourlyMix(args: {
  tickets: Array<{ closedAt: Date | null; totalCents: number }>;
  timezone: string;
}): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    ticketCount: 0,
    revenueCents: 0,
  }));

  for (const t of args.tickets) {
    if (t.closedAt === null) continue;
    const hh = Number(formatInTimeZone(t.closedAt, args.timezone, 'HH'));
    if (!Number.isFinite(hh) || hh < 0 || hh > 23) continue;
    const bucket = buckets[hh]!;
    bucket.ticketCount += 1;
    bucket.revenueCents += t.totalCents;
  }

  return buckets;
}
