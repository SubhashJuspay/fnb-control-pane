/**
 * Helpers for the public order surface that operate on the
 * `Location.openingHours` JSON shape:
 *
 *   { mon: [{ open: "07:00", close: "21:00" }], tue: [...], ... }
 *
 * Hours are interpreted in the location's IANA timezone. Each day can have
 * zero or more half-open intervals; an empty array means closed all day.
 */

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface OpeningInterval {
  open: string;
  close: string;
}

export type OpeningHours = Partial<Record<DayKey, OpeningInterval[]>>;

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABEL: Record<DayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

/** Coerce arbitrary JSON into an OpeningHours object. */
export function parseOpeningHours(raw: unknown): OpeningHours | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: OpeningHours = {};
  for (const day of DAY_KEYS) {
    const v = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(v)) continue;
    const intervals: OpeningInterval[] = [];
    for (const iv of v) {
      if (
        iv &&
        typeof iv === 'object' &&
        typeof (iv as { open?: unknown }).open === 'string' &&
        typeof (iv as { close?: unknown }).close === 'string'
      ) {
        intervals.push({
          open: (iv as { open: string }).open,
          close: (iv as { close: string }).close,
        });
      }
    }
    out[day] = intervals;
  }
  return out;
}

/**
 * Compute the day-key + hour:minute "now" looks like in the given IANA
 * timezone. We use Intl.DateTimeFormat parts so we don't need a tz library.
 */
function nowInZone(timezone: string, at: Date = new Date()): {
  day: DayKey;
  minutes: number; // minutes since midnight in that zone
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  let weekday = 'sun';
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'weekday') weekday = p.value.toLowerCase().slice(0, 3);
    if (p.type === 'hour') hour = Number.parseInt(p.value, 10);
    if (p.type === 'minute') minute = Number.parseInt(p.value, 10);
  }
  // 24h Intl reports hour=24 at midnight on some Node builds; normalize.
  if (hour === 24) hour = 0;
  return {
    day: (DAY_KEYS.find((d) => d === weekday) ?? 'sun') as DayKey,
    minutes: hour * 60 + minute,
  };
}

function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number.parseInt(m[1] ?? '0', 10);
  const mm = Number.parseInt(m[2] ?? '0', 10);
  if (h < 0 || h > 24 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function formatHM(s: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return s;
  const h = Number.parseInt(m[1] ?? '0', 10);
  const mm = Number.parseInt(m[2] ?? '0', 10);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12}${period}` : `${h12}:${String(mm).padStart(2, '0')}${period}`;
}

export interface OpenStatus {
  isOpen: boolean;
  /** Today's intervals, regardless of open/closed. */
  todayIntervals: OpeningInterval[];
  /** If isOpen, when today's interval ends (HH:MM in zone). Else null. */
  closesAt: string | null;
  /**
   * If !isOpen and the next opening is later today or tomorrow, the time +
   * "today"/"tomorrow" hint. Otherwise null.
   */
  reopensAt: { time: string; relative: 'today' | 'tomorrow' | 'later' } | null;
}

/**
 * True when `nowMinutes` falls inside an interval, including the late-night
 * wrap case (close <= open means the interval continues past midnight). The
 * common shapes:
 *   - 09:00 → 17:00 — same day (close > open).
 *   - 22:00 → 02:00 — wraps; open from 22:00 today through 02:00 tomorrow.
 *   - 01:00 → 00:00 — wraps; open from 01:00 today through end of today
 *                    (00:00 = "midnight" = 24:00 of today).
 */
function withinInterval(nowMinutes: number, open: number, close: number): boolean {
  if (close > open) {
    return nowMinutes >= open && nowMinutes < close;
  }
  if (close === open) {
    // Zero-length interval — treat as closed.
    return false;
  }
  // close < open: wraps past midnight. Inside if we're past `open` today
  // OR we're before `close` (i.e., still in yesterday's late-night portion).
  return nowMinutes >= open || nowMinutes < close;
}

/**
 * Decide whether the location is open right now and surface the next
 * meaningful timestamp for the customer to see.
 */
export function computeOpenStatus(
  hours: OpeningHours | null,
  timezone: string,
  at: Date = new Date(),
): OpenStatus {
  if (!hours) {
    return { isOpen: true, todayIntervals: [], closesAt: null, reopensAt: null };
  }
  const here = nowInZone(timezone, at);
  const today = hours[here.day] ?? [];

  // 1) Are we inside a same-day interval that started today?
  for (const iv of today) {
    const o = parseHM(iv.open);
    const c = parseHM(iv.close);
    if (o == null || c == null) continue;
    if (withinInterval(here.minutes, o, c)) {
      return {
        isOpen: true,
        todayIntervals: today,
        closesAt: iv.close,
        reopensAt: null,
      };
    }
  }

  // 2) We might still be inside *yesterday's* late-night wrap interval.
  //    e.g. yesterday's "22:00 → 02:00" and now=01:30.
  const yesterdayIdx = (DAY_KEYS.indexOf(here.day) + 6) % 7;
  const yesterdayKey = DAY_KEYS[yesterdayIdx] as DayKey;
  const yesterday = hours[yesterdayKey] ?? [];
  for (const iv of yesterday) {
    const o = parseHM(iv.open);
    const c = parseHM(iv.close);
    if (o == null || c == null) continue;
    if (c < o && here.minutes < c) {
      return {
        isOpen: true,
        todayIntervals: today,
        closesAt: iv.close,
        reopensAt: null,
      };
    }
  }

  // Closed now. Find the next opening today (interval starting after `now`).
  for (const iv of today) {
    const o = parseHM(iv.open);
    if (o != null && o > here.minutes) {
      return {
        isOpen: false,
        todayIntervals: today,
        closesAt: null,
        reopensAt: { time: iv.open, relative: 'today' },
      };
    }
  }

  // Otherwise look at the next non-empty day.
  for (let off = 1; off <= 7; off++) {
    const idx = (DAY_KEYS.indexOf(here.day) + off) % 7;
    const next = hours[DAY_KEYS[idx] as DayKey] ?? [];
    if (next.length > 0 && next[0]?.open) {
      return {
        isOpen: false,
        todayIntervals: today,
        closesAt: null,
        reopensAt: {
          time: next[0].open,
          relative: off === 1 ? 'tomorrow' : 'later',
        },
      };
    }
  }
  return { isOpen: false, todayIntervals: today, closesAt: null, reopensAt: null };
}

/** Format an array of intervals as "7am – 9pm" / "12pm – 2pm, 7pm – 11pm". */
export function formatDayIntervals(intervals: OpeningInterval[]): string {
  if (intervals.length === 0) return 'Closed';
  return intervals
    .map((iv) => {
      const o = parseHM(iv.open);
      const c = parseHM(iv.close);
      const closeLabel =
        iv.close === '00:00' || (o != null && c != null && c < o)
          ? 'midnight'
          : formatHM(iv.close);
      return `${formatHM(iv.open)} – ${closeLabel}`;
    })
    .join(', ');
}

export { DAY_LABEL, DAY_KEYS };
export { formatHM };
