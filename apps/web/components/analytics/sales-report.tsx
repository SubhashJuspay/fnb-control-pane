'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { ChartCard, KpiCard, LineChart, formatMoney } from '@repo/ui';
import {
  HourlyMixDocument,
  SalesSummaryDocument,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import {
  DateRangePicker,
  defaultDateRange,
  type DateRange,
} from './date-range-picker';
import { toDateRangeInput } from './date-range-input';

/**
 * "Sales" insights tab: KPI summary across the picked range plus an hourly
 * revenue chart. We fire two queries (summary + hourlyMix) and let urql's
 * cache dedupe across tabs that share the same range.
 */
export function SalesReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const variables = useMemo(
    () => ({ dateRange: toDateRangeInput(range) }),
    [range],
  );
  const currency = useLocationCurrency();

  const [{ data: summaryData, fetching: summaryFetching, error: summaryError }] =
    useQuery({ query: SalesSummaryDocument, variables });
  const [{ data: hourlyData, error: hourlyError }] = useQuery({
    query: HourlyMixDocument,
    variables,
  });

  const summary = summaryData?.salesSummary;
  const hourlyRows = (hourlyData?.hourlyMix ?? []).filter(
    (b): b is NonNullable<typeof b> => b != null,
  );
  const hourlyChartData = hourlyRows.map((b) => ({
    label: String(b.hour ?? 0),
    value: (b.revenueCents ?? 0) / 100,
  }));

  return (
    <div className="flex flex-col gap-4">
      <DateRangePicker value={range} onChange={setRange} />
      {summaryError ? (
        <p className="text-sm text-destructive" role="alert">
          {summaryError.message}
        </p>
      ) : null}
      {hourlyError ? (
        <p className="text-sm text-destructive" role="alert">
          {hourlyError.message}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCard
          label="Net sales"
          value={formatMoney(summary?.netSalesCents ?? 0, currency)}
          subValue={summaryFetching ? 'Loading…' : `Gross ${formatMoney(summary?.grossSalesCents ?? 0, currency)}`}
          testId="kpi-net-sales"
        />
        <KpiCard
          label="Tickets"
          value={summary?.closedTicketCount ?? 0}
          subValue={`${summary?.voidedTicketCount ?? 0} voided`}
          testId="kpi-tickets"
        />
        <KpiCard
          label="Avg ticket"
          value={formatMoney(summary?.averageTicketCents ?? 0, currency)}
          testId="kpi-avg-ticket"
        />
        <KpiCard
          label="Unique guests"
          value={summary?.uniqueGuests ?? 0}
          testId="kpi-unique-guests"
        />
      </div>
      <ChartCard
        title="Revenue by hour"
        subtitle="Closed ticket revenue, bucketed by hour-of-day in this location's timezone."
        testId="hourly-revenue-card"
      >
        <LineChart
          data={hourlyChartData}
          xTickFormatter={(h) => `${h}:00`}
          yTickFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          valueFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          testId="hourly-revenue-chart"
        />
      </ChartCard>
    </div>
  );
}
