'use client';

import { useMemo } from 'react';
import { useQuery } from 'urql';
import {
  ChartCard,
  DataTable,
  KpiCard,
  LineChart,
  formatMoney,
  type Column,
} from '@repo/ui';
import {
  HourlyMixDocument,
  SalesSummaryDocument,
  TopItemsDocument,
  TopItemsSort,
  type TopItemsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import {
  lastNDaysRange,
  todayRange,
} from './date-range-picker';
import { toDateRangeInput } from './date-range-input';

type TopItemRow = NonNullable<NonNullable<TopItemsQuery['topItems']>[number]>;

/**
 * Manager landing page: today's KPIs + last-7-days revenue sparkline + the
 * top 5 items today. Three queries fire in parallel and the API caches each
 * for 60s so navigating between location-scoped pages reuses the same data.
 */
export function DashboardPage(): React.JSX.Element {
  const todayVariables = useMemo(
    () => ({ dateRange: toDateRangeInput(todayRange()) }),
    [],
  );
  const last7Variables = useMemo(
    () => ({ dateRange: toDateRangeInput(lastNDaysRange(7)) }),
    [],
  );
  const currency = useLocationCurrency();

  const [{ data: summaryData, error: summaryError }] = useQuery({
    query: SalesSummaryDocument,
    variables: todayVariables,
  });
  const [{ data: topItemsData }] = useQuery({
    query: TopItemsDocument,
    variables: { ...todayVariables, by: TopItemsSort.Quantity, limit: 5 },
  });
  const [{ data: hourlyData }] = useQuery({
    query: HourlyMixDocument,
    variables: last7Variables,
  });

  const summary = summaryData?.salesSummary;
  const topRows: TopItemRow[] = (topItemsData?.topItems ?? []).filter(
    (r): r is TopItemRow => r != null,
  );
  const hourly = (hourlyData?.hourlyMix ?? []).filter(
    (b): b is NonNullable<typeof b> => b != null,
  );
  const sparkData = hourly.map((b) => ({
    label: String(b.hour ?? 0),
    value: (b.revenueCents ?? 0) / 100,
  }));

  const columns: Column<TopItemRow>[] = [
    { key: 'name', header: 'Item', cell: (r) => r.menuItemName ?? '—' },
    {
      key: 'qty',
      header: 'Qty',
      className: 'text-right tabular-nums',
      cell: (r) => r.quantitySold ?? 0,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      className: 'text-right tabular-nums',
      cell: (r) => formatMoney(r.revenueCents ?? 0, currency),
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="dashboard-page">
      {summaryError ? (
        <p className="text-sm text-destructive" role="alert">
          {summaryError.message}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCard
          label="Net sales today"
          value={formatMoney(summary?.netSalesCents ?? 0, currency)}
          testId="kpi-net-sales-today"
        />
        <KpiCard
          label="Tickets today"
          value={summary?.closedTicketCount ?? 0}
          testId="kpi-tickets-today"
        />
        <KpiCard
          label="Avg ticket"
          value={formatMoney(summary?.averageTicketCents ?? 0, currency)}
          testId="kpi-avg-ticket-today"
        />
        <KpiCard
          label="Unique guests"
          value={summary?.uniqueGuests ?? 0}
          testId="kpi-unique-guests-today"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Last 7 days · revenue by hour"
          testId="dashboard-spark-card"
        >
          <LineChart
            data={sparkData}
            xTickFormatter={(h) => `${h}:00`}
            yTickFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
            valueFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
            testId="dashboard-spark"
            height={200}
          />
        </ChartCard>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Top 5 items today</h3>
          <DataTable
            rows={topRows}
            columns={columns}
            rowKey={(r) => r.menuItemId ?? ''}
            emptyTitle="No items today"
            emptyDescription="Top items appear once tickets close."
          />
        </div>
      </div>
    </div>
  );
}
