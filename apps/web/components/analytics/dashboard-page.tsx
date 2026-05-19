'use client';

import { useMemo } from 'react';
import { useQuery } from 'urql';
import {
  BarChart,
  ChartCard,
  DataTable,
  KpiCard,
  LineChart,
  formatMoney,
  type Column,
} from '@repo/ui';
import {
  DayOfWeekMixDocument,
  HourlyMixDocument,
  LaborCostDocument,
  SalesSummaryDocument,
  TopItemsDocument,
  TopItemsSort,
  type TopItemsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { lastNDaysRange, todayRange } from './date-range-picker';
import { toDateRangeInput } from './date-range-input';

type TopItemRow = NonNullable<NonNullable<TopItemsQuery['topItems']>[number]>;

const WEEKDAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const WEEKDAY_LABELS: Record<(typeof WEEKDAY_ORDER)[number], string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

/**
 * Manager landing page. Folds in the slices that used to live on the
 * standalone Insights / End-of-Day pages:
 *
 *   - Today's KPIs row (net sales, tickets, avg ticket, unique guests).
 *   - Today's labor-cost pill (cost vs revenue ratio).
 *   - Last-7-days revenue-by-hour sparkline.
 *   - Last-30-days day-of-week mix bar chart.
 *   - Top 5 items today.
 *
 * Queries fire in parallel and the API caches each for ~60s so navigating
 * back to this page from elsewhere reuses the same data.
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
  const last30Variables = useMemo(
    () => ({ dateRange: toDateRangeInput(lastNDaysRange(30)) }),
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
  const [{ data: dowData }] = useQuery({
    query: DayOfWeekMixDocument,
    variables: last30Variables,
  });
  const [{ data: laborData }] = useQuery({
    query: LaborCostDocument,
    variables: todayVariables,
  });

  const summary = summaryData?.salesSummary;
  const labor = laborData?.laborCost;
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

  // Day-of-week mix — re-sort into Mon-first order so the chart reads as
  // an actual week rather than alphabetical bucket order.
  const dowBuckets = (dowData?.dayOfWeekMix ?? []).filter(
    (b): b is NonNullable<typeof b> => b != null,
  );
  const dowByKey = new Map(dowBuckets.map((b) => [b.dayOfWeek ?? 'MON', b]));
  const dowData30 = WEEKDAY_ORDER.map((key) => {
    const bucket = dowByKey.get(key);
    return {
      label: WEEKDAY_LABELS[key],
      value: (bucket?.revenueCents ?? 0) / 100,
    };
  });

  // Labor cost pill colour — same thresholds the labor-report uses.
  const laborPctCents = labor?.laborCostPct ?? null;
  const laborPctNum = laborPctCents != null ? laborPctCents / 100 : null;
  const laborTone =
    laborPctNum == null
      ? 'neutral'
      : laborPctNum <= 25
        ? 'good'
        : laborPctNum <= 35
          ? 'warn'
          : 'bad';

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
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
        <LaborCostKpi tone={laborTone} pct={laborPctNum} />
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

      <ChartCard
        title="Last 30 days · revenue by weekday"
        testId="dashboard-dow-card"
      >
        <BarChart
          data={dowData30}
          yTickFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          valueFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
          testId="dashboard-dow"
          height={220}
        />
      </ChartCard>
    </div>
  );
}

function LaborCostKpi({
  tone,
  pct,
}: {
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  pct: number | null;
}): React.JSX.Element {
  const palette = {
    good: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    bad: 'text-rose-700 dark:text-rose-300',
    neutral: 'text-on-surface-variant',
  } as const;
  return (
    <KpiCard
      label="Labor cost today"
      value={
        <span className={palette[tone]}>
          {pct == null ? '—' : `${pct.toFixed(1)}%`}
        </span>
      }
      testId="kpi-labor-cost-today"
    />
  );
}
