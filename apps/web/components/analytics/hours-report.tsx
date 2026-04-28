'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { BarChart, ChartCard, formatMoney } from '@repo/ui';
import {
  DayOfWeekMixDocument,
  HourlyMixDocument,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import {
  DateRangePicker,
  defaultDateRange,
  type DateRange,
} from './date-range-picker';
import { toDateRangeInput } from './date-range-input';

const DOW_LABEL: Record<string, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

export function HoursReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const variables = useMemo(
    () => ({ dateRange: toDateRangeInput(range) }),
    [range],
  );
  const currency = useLocationCurrency();

  const [{ data: hourlyData, error: hourlyError }] = useQuery({
    query: HourlyMixDocument,
    variables,
  });
  const [{ data: dayData, error: dayError }] = useQuery({
    query: DayOfWeekMixDocument,
    variables,
  });

  const hourlyRows = (hourlyData?.hourlyMix ?? []).filter(
    (b): b is NonNullable<typeof b> => b != null,
  );
  const hourlyChartData = hourlyRows.map((b) => ({
    label: String(b.hour ?? 0),
    value: (b.revenueCents ?? 0) / 100,
  }));

  const dayRows = (dayData?.dayOfWeekMix ?? []).filter(
    (b): b is NonNullable<typeof b> => b != null,
  );
  const dayChartData = dayRows.map((b) => ({
    label: String(b.dayOfWeek ?? ''),
    value: (b.revenueCents ?? 0) / 100,
  }));

  return (
    <div className="flex flex-col gap-4">
      <DateRangePicker value={range} onChange={setRange} />
      {hourlyError ? (
        <p className="text-sm text-destructive" role="alert">
          {hourlyError.message}
        </p>
      ) : null}
      {dayError ? (
        <p className="text-sm text-destructive" role="alert">
          {dayError.message}
        </p>
      ) : null}
      <ChartCard
        title="Revenue by hour"
        subtitle="Hour-of-day in this location's timezone."
        testId="hourly-bars-card"
      >
        <BarChart
          data={hourlyChartData}
          xTickFormatter={(h) => `${h}:00`}
          yTickFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          valueFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          testId="hourly-bars"
        />
      </ChartCard>
      <ChartCard
        title="Revenue by day-of-week"
        testId="dow-bars-card"
      >
        <BarChart
          data={dayChartData}
          xTickFormatter={(d) => DOW_LABEL[d] ?? d}
          yTickFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          valueFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          testId="dow-bars"
        />
      </ChartCard>
    </div>
  );
}
