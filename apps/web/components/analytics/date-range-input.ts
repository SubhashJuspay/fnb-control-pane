import type { DateRange } from './date-range-picker';

export interface DateRangeInputShape {
  from: string;
  to: string;
}

/**
 * Convert a `<DateRangePicker>` value into the shape the analytics queries
 * expect — both ends are ISO strings; the API resolves them against the
 * location's timezone + businessDayCutoff to get the UTC bounds it scans.
 */
export function toDateRangeInput(range: DateRange): DateRangeInputShape {
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };
}
