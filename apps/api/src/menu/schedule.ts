import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { Schedule, DayOfWeek } from '@repo/validation';

function localDayOfWeek(at: Date, timezone: string): DayOfWeek {
  // formatInTimeZone with 'i' returns ISO weekday (1=Mon..7=Sun).
  const idx = Number(formatInTimeZone(at, timezone, 'i'));
  switch (idx) {
    case 1:
      return 'MON';
    case 2:
      return 'TUE';
    case 3:
      return 'WED';
    case 4:
      return 'THU';
    case 5:
      return 'FRI';
    case 6:
      return 'SAT';
    case 7:
      return 'SUN';
    default:
      throw new Error(`Unexpected weekday index ${idx}`);
  }
}

function toMinutesOfDay(localTime: string): number {
  const [h, m] = localTime.split(':');
  return Number(h) * 60 + Number(m);
}

function localMinutesOfDay(at: Date, timezone: string): number {
  const hours = Number(formatInTimeZone(at, timezone, 'HH'));
  const minutes = Number(formatInTimeZone(at, timezone, 'mm'));
  return hours * 60 + minutes;
}

/**
 * Convert a local-date "YYYY-MM-DD" + "HH:MM" string in the given timezone to a UTC Date.
 */
function localToUtc(yyyymmdd: string, hhmm: string, timezone: string): Date {
  return fromZonedTime(`${yyyymmdd}T${hhmm}:00`, timezone);
}

export function isMenuLiveAt(args: {
  schedule: Schedule;
  timezone: string;
  at: Date;
}): boolean {
  if (args.schedule.kind === 'always') return true;
  const day = localDayOfWeek(args.at, args.timezone);
  const minutes = localMinutesOfDay(args.at, args.timezone);
  for (const window of args.schedule.windows) {
    if (!window.days.includes(day)) continue;
    const start = toMinutesOfDay(window.start);
    const end = toMinutesOfDay(window.end);
    if (minutes >= start && minutes < end) return true;
  }
  return false;
}

export function resolveActiveMenus(args: {
  menus: Array<{ id: string; isActive: boolean; schedule: Schedule }>;
  timezone: string;
  at: Date;
}): string[] {
  return args.menus
    .filter(
      (m) =>
        m.isActive &&
        isMenuLiveAt({ schedule: m.schedule, timezone: args.timezone, at: args.at }),
    )
    .map((m) => m.id);
}

/**
 * Returns the bounds of either the currently active window or the next future window.
 * Returns null when schedule is `always` (no discrete window).
 */
export function nextScheduleWindow(args: {
  schedule: Schedule;
  timezone: string;
  at: Date;
}): { start: Date; end: Date } | null {
  if (args.schedule.kind === 'always') return null;

  // Check the next 8 days inclusive (covers weekly recurrence + this week).
  const local = toZonedTime(args.at, args.timezone);
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const candidateLocal = addDays(local, dayOffset);
    const day = localDayOfWeek(candidateLocal, args.timezone);
    const yyyymmdd = formatInTimeZone(candidateLocal, args.timezone, 'yyyy-MM-dd');
    const candidateMinutesNow = dayOffset === 0 ? localMinutesOfDay(args.at, args.timezone) : 0;

    // Collect this day's windows that haven't fully passed yet.
    const todays = args.schedule.windows
      .filter((w) => w.days.includes(day))
      .map((w) => ({
        startM: toMinutesOfDay(w.start),
        endM: toMinutesOfDay(w.end),
        startStr: w.start,
        endStr: w.end,
      }))
      .filter((w) => w.endM > candidateMinutesNow)
      .sort((a, b) => a.startM - b.startM);

    if (todays.length === 0) continue;
    const first = todays[0]!;
    return {
      start: localToUtc(yyyymmdd, first.startStr, args.timezone),
      end: localToUtc(yyyymmdd, first.endStr, args.timezone),
    };
  }
  return null;
}
