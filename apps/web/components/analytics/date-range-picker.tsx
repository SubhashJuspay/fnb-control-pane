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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fromInputValue(s: string): Date {
  // Construct in local time at midnight; the API converts to UTC using the
  // location's businessDayCutoff + timezone, so what we send is interpreted
  // as a calendar day rather than an instant.
  const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
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

export function defaultDateRange(): DateRange {
  const today = new Date();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const from = new Date(to);
  from.setDate(from.getDate() - 6); // last 7 calendar days inclusive
  return { from, to };
}

export function todayRange(): DateRange {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { from: day, to: day };
}

export function lastNDaysRange(n: number): DateRange {
  const today = new Date();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const from = new Date(to);
  from.setDate(from.getDate() - (n - 1));
  return { from, to };
}
