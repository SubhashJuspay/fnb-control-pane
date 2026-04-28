import { fromZonedTime } from 'date-fns-tz';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function ymdFromUtc(d: Date): { y: number; m: number; d: number } {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function ymdString(parts: { y: number; m: number; d: number }): string {
  return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}`;
}

function addDaysUtc(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Resolves a `[from, to]` business-day range (local-day boundaries) into UTC
 * instants suitable for Prisma `gte`/`lt` comparisons against `closedAt`.
 *
 * `from` and `to` are interpreted as the local *calendar dates* whose UTC date
 * components identify each day. The returned `fromUtc` is the UTC instant of
 * the cutoff time on the `from` date in `timezone`; `toUtc` is the cutoff time
 * on the day *after* `to` (exclusive end).
 *
 * Example: `from = to = Apr 26`, `timezone = America/Los_Angeles`,
 * `cutoff = 04:00` → covers `04:00 PDT Apr 26` to `04:00 PDT Apr 27`.
 */
export function resolveBusinessDayRange(args: {
  from: Date;
  to: Date;
  timezone: string;
  businessDayCutoff: string;
}): { fromUtc: Date; toUtc: Date } {
  const [hhStr, mmStr] = args.businessDayCutoff.split(':');
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    throw new Error(`Invalid businessDayCutoff: ${args.businessDayCutoff}`);
  }

  const fromYmd = ymdString(ymdFromUtc(args.from));
  const toYmd = ymdString(ymdFromUtc(addDaysUtc(args.to, 1)));

  const cutoffSuffix = `T${pad2(hh)}:${pad2(mm)}:00`;
  const fromUtc = fromZonedTime(`${fromYmd}${cutoffSuffix}`, args.timezone);
  const toUtc = fromZonedTime(`${toYmd}${cutoffSuffix}`, args.timezone);

  return { fromUtc, toUtc };
}
