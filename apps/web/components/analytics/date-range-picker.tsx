'use client';

import { Input, Label } from '@repo/ui';

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

function toInputValue(d: Date): string {
  // Read the date components in UTC — `fromInputValue` produces noon-UTC
  // dates, so this round-trips correctly without slipping a day in viewers
  // east of UTC.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fromInputValue(s: string): Date {
  // The api re-buckets the instant we send through `ymdFromUtc` to read off
  // the calendar date in UTC, then re-anchors to the location timezone. We
  // therefore anchor at noon-UTC of the chosen day so the UTC date components
  // always describe the day the user picked, regardless of the viewer's
  // browser timezone (e.g. IST is 5h30 ahead — local-midnight `2026-04-29`
  // would otherwise be 2026-04-28T18:30Z and bucket as the prior day).
  const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

/**
 * Controlled date range picker. Emits dates anchored at local-midnight; the
 * analytics resolvers re-anchor to UTC using the location's cutoff so callers
 * don't have to think about timezones.
 */
export function DateRangePicker({
  value,
  onChange,
}: DateRangePickerProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="date-range-picker">
      <div className="flex flex-col gap-1">
        <Label htmlFor="dr-from" className="text-xs">
          From
        </Label>
        <Input
          id="dr-from"
          type="date"
          value={toInputValue(value.from)}
          onChange={(e) =>
            onChange({ from: fromInputValue(e.target.value), to: value.to })
          }
          className="h-8 w-40"
          data-input="from"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dr-to" className="text-xs">
          To
        </Label>
        <Input
          id="dr-to"
          type="date"
          value={toInputValue(value.to)}
          onChange={(e) =>
            onChange({ from: value.from, to: fromInputValue(e.target.value) })
          }
          className="h-8 w-40"
          data-input="to"
        />
      </div>
    </div>
  );
}

/**
 * Anchor the calendar day we want to label at noon-UTC. The api reads the
 * UTC date components off this instant to derive a `YYYY-MM-DD` calendar
 * day, then re-anchors to the location's timezone + cutoff. Anchoring at
 * noon-UTC keeps that calendar day stable for viewers anywhere in the
 * ±12h envelope.
 */
function noonUtc(year: number, monthIdx: number, day: number): Date {
  return new Date(Date.UTC(year, monthIdx, day, 12));
}

function todayUtcParts(): { y: number; m: number; d: number } {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

export function defaultDateRange(): DateRange {
  const t = todayUtcParts();
  const to = noonUtc(t.y, t.m, t.d);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6); // last 7 calendar days inclusive
  return { from, to };
}

export function todayRange(): DateRange {
  const t = todayUtcParts();
  const day = noonUtc(t.y, t.m, t.d);
  return { from: day, to: day };
}

export function lastNDaysRange(n: number): DateRange {
  const t = todayUtcParts();
  const to = noonUtc(t.y, t.m, t.d);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (n - 1));
  return { from, to };
}
