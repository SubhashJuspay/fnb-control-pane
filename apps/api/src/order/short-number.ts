import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { PrismaClient } from '@repo/db';

/**
 * Compute the "business day" calendar date (UTC midnight on that date) for a given moment,
 * given the location's timezone and businessDayCutoff (HH:MM local).
 *
 * If `at` is before the cutoff (local time), business day is the previous calendar day.
 * Otherwise it is the current calendar day.
 */
export function computeBusinessDay(args: {
  at: Date;
  businessDayCutoff: string;
  timezone: string;
}): Date {
  const localDateStr = formatInTimeZone(args.at, args.timezone, 'yyyy-MM-dd');
  const localTimeStr = formatInTimeZone(args.at, args.timezone, 'HH:mm');
  const dateUtcMidnight = (yyyymmdd: string): Date =>
    new Date(`${yyyymmdd}T00:00:00.000Z`);

  if (localTimeStr < args.businessDayCutoff) {
    // previous day
    const local = fromZonedTime(`${localDateStr}T00:00:00`, args.timezone);
    const prev = new Date(local.getTime() - 24 * 60 * 60 * 1000);
    const prevStr = formatInTimeZone(prev, args.timezone, 'yyyy-MM-dd');
    return dateUtcMidnight(prevStr);
  }
  return dateUtcMidnight(localDateStr);
}

/**
 * Atomically reserves the next `shortNumber` for (locationId, businessDay).
 * Uses a SELECT MAX inside a transaction; the unique index on
 * (location_id, business_day, short_number) prevents collisions on contention.
 */
export async function nextShortNumber(args: {
  prisma: PrismaClient;
  locationId: string;
  businessDay: Date;
}): Promise<number> {
  const result = await args.prisma.ticket.aggregate({
    where: { locationId: args.locationId, businessDay: args.businessDay },
    _max: { shortNumber: true },
  });
  return (result._max.shortNumber ?? 0) + 1;
}
