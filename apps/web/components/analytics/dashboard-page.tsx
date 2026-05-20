'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  KitchenTicketsDocument,
  LaborCostDocument,
  OnlineOrderConfirmStatus,
  OnlineOrderRequestsDocument,
  OpenTicketsDocument,
  SalesSummaryDocument,
  TicketHistoryDocument,
  FloorTablesDocument,
  TopItemsDocument,
  TopItemsSort,
  type TopItemsQuery,
  type TicketHistoryQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { useLocationClock } from '@/lib/location-timezone';
import { lastNDaysRange, todayRange } from './date-range-picker';
import { toDateRangeInput } from './date-range-input';

type TopItemRow = NonNullable<NonNullable<TopItemsQuery['topItems']>[number]>;
type TicketEdge = NonNullable<
  NonNullable<TicketHistoryQuery['ticketHistory']>['edges']
>[number];

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
 * Manager landing page. Three bands:
 *
 *   1. Right-now strip — open tickets, online orders pending, tables, kitchen
 *      queue. Each clickable to drill into the live op.
 *   2. Today's pace — sales / tickets / avg ticket / labor cost, each with a
 *      vs-same-weekday-last-week delta so the operator sees direction.
 *   3. Charts + tables — today's hourly revenue, last-30-days weekday mix,
 *      top items, recent activity feed.
 *
 * All queries are network-and-cache (urql default). The right-now strip uses
 * cache-and-network so it refetches on every mount.
 */
export function DashboardPage(): React.JSX.Element {
  const currency = useLocationCurrency();
  // Compute "today" in the *location's* business day, not the viewer's
  // browser clock. The clock includes both the IANA timezone and the
  // local cutoff so early-morning hours (before the cutoff) still bucket
  // into yesterday — without this, a 02:00 close at a 04:00-cutoff
  // location reads as "today" in the browser but is bucketed into the
  // prior business day on the server, and the dashboard reads zeros.
  const clock = useLocationClock();
  // The dashboard is mounted under /[tenantSlug]/[locationSlug]/dashboard
  // so the route params are always present. Falling back to empty strings
  // keeps the type narrow; the drill-in links degrade to no-ops in the
  // (theoretical) case the params are missing.
  const params = useParams<{ tenantSlug?: string; locationSlug?: string }>();
  const tenantSlug = params?.tenantSlug ?? '';
  const locationSlug = params?.locationSlug ?? '';

  const todayVariables = useMemo(
    () => ({ dateRange: toDateRangeInput(todayRange(clock)) }),
    [clock],
  );
  const sameDayLastWeekVariables = useMemo(() => {
    // Same calendar weekday seven days ago, single-day range.
    const today = todayRange(clock);
    const from = new Date(today.from);
    from.setUTCDate(from.getUTCDate() - 7);
    const to = new Date(today.to);
    to.setUTCDate(to.getUTCDate() - 7);
    return { dateRange: toDateRangeInput({ from, to }) };
  }, [clock]);
  const last30Variables = useMemo(
    () => ({ dateRange: toDateRangeInput(lastNDaysRange(30, clock)) }),
    [clock],
  );

  // ── Live ops queries ──────────────────────────────────────────
  const [{ data: openTicketsData }] = useQuery({
    query: OpenTicketsDocument,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: kitchenData }] = useQuery({
    query: KitchenTicketsDocument,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: onlineData }] = useQuery({
    query: OnlineOrderRequestsDocument,
    variables: { filter: { status: OnlineOrderConfirmStatus.Pending } },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: floorData }] = useQuery({
    query: FloorTablesDocument,
    requestPolicy: 'cache-and-network',
  });

  // ── Analytics queries ─────────────────────────────────────────
  // cache-and-network on all of them: urql's default `cache-first` would
  // keep the first-paint snapshot until variables change, which means
  // tickets the cashier closed seconds ago would not show up on remount.
  // The server already has a 60s TTL on top, so the network round-trip
  // is cheap when the cache is warm.
  const [{ data: summaryToday }] = useQuery({
    query: SalesSummaryDocument,
    variables: todayVariables,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: summaryLastWeek }] = useQuery({
    query: SalesSummaryDocument,
    variables: sameDayLastWeekVariables,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: hourlyData }] = useQuery({
    query: HourlyMixDocument,
    variables: todayVariables,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: dowData }] = useQuery({
    query: DayOfWeekMixDocument,
    variables: last30Variables,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: laborToday }] = useQuery({
    query: LaborCostDocument,
    variables: todayVariables,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: topItemsData }] = useQuery({
    query: TopItemsDocument,
    variables: { ...todayVariables, by: TopItemsSort.Quantity, limit: 5 },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: historyData }] = useQuery({
    query: TicketHistoryDocument,
    variables: { first: 10 },
    requestPolicy: 'cache-and-network',
  });

  // ── Derived values ────────────────────────────────────────────
  const openTickets = (openTicketsData?.openTickets ?? []).filter(
    (t): t is NonNullable<typeof t> => t != null,
  );
  const openTicketsValue = openTickets.reduce(
    (sum, t) => sum + (t.totalCents ?? 0),
    0,
  );

  const kitchenTickets = (kitchenData?.kitchenTickets ?? []).filter(
    (t): t is NonNullable<typeof t> => t != null,
  );
  const oldestKitchenAgeMin = computeOldestAgeMinutes(
    kitchenTickets.map((t) => t.openedAt as string | null),
  );

  const pendingOnline = (onlineData?.onlineOrderRequests ?? []).filter(
    (r): r is NonNullable<typeof r> => r != null,
  );
  const oldestOnlineAgeMin = computeOldestAgeMinutes(
    pendingOnline.map((r) => r.createdAt as string | null),
  );

  const floorTables = (floorData?.floorTables ?? []).filter(
    (t): t is NonNullable<typeof t> => t != null && t.archivedAt == null,
  );
  const tablesOccupied = floorTables.filter((t) => t.state === 'OCCUPIED').length;
  const tablesCleaning = floorTables.filter(
    (t) => t.manualState === 'CLEANING',
  ).length;

  // Today vs last-week deltas.
  const today = summaryToday?.salesSummary;
  const lastWeek = summaryLastWeek?.salesSummary;
  const netDelta = deltaMoney(today?.netSalesCents, lastWeek?.netSalesCents);
  const ticketDelta = deltaCount(
    today?.closedTicketCount,
    lastWeek?.closedTicketCount,
  );
  const avgDelta = deltaMoney(
    today?.averageTicketCents,
    lastWeek?.averageTicketCents,
  );

  const labor = laborToday?.laborCost;
  const laborPctNum = labor?.laborCostPct != null ? labor.laborCostPct / 100 : null;
  const laborTone =
    laborPctNum == null
      ? 'neutral'
      : laborPctNum <= 25
        ? 'good'
        : laborPctNum <= 35
          ? 'warn'
          : 'bad';

  const hourly = (hourlyData?.hourlyMix ?? []).filter(
    (b): b is NonNullable<typeof b> => b != null,
  );
  const sparkData = hourly.map((b) => ({
    label: String(b.hour ?? 0),
    value: (b.revenueCents ?? 0) / 100,
  }));

  const dowBuckets = (dowData?.dayOfWeekMix ?? []).filter(
    (b): b is NonNullable<typeof b> => b != null,
  );
  const dowByKey = new Map(dowBuckets.map((b) => [b.dayOfWeek ?? 'MON', b]));
  const dowChartData = WEEKDAY_ORDER.map((key) => ({
    label: WEEKDAY_LABELS[key],
    value: (dowByKey.get(key)?.revenueCents ?? 0) / 100,
  }));

  const topRows: TopItemRow[] = (topItemsData?.topItems ?? []).filter(
    (r): r is TopItemRow => r != null,
  );

  const recentTickets: TicketEdge[] = (
    historyData?.ticketHistory?.edges ?? []
  ).filter((e): e is TicketEdge => e != null);

  const base = `/${tenantSlug}/${locationSlug}`;

  return (
    <div className="flex flex-col gap-stack-loose" data-testid="dashboard-page">
      {/* Band 1 — Right now */}
      <section className="flex flex-col gap-2">
        <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Right now
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link href={`${base}/pos`} className="contents">
            <LiveTile
              label="Open tickets"
              icon="receipt_long"
              value={openTickets.length}
              caption={
                openTickets.length > 0
                  ? `${formatMoney(openTicketsValue, currency)} in flight`
                  : 'All clear'
              }
            />
          </Link>
          <Link href={`${base}/online-orders`} className="contents">
            <LiveTile
              label="Online orders pending"
              icon="shopping_bag"
              value={pendingOnline.length}
              caption={
                pendingOnline.length === 0
                  ? 'Inbox is clear'
                  : oldestOnlineAgeMin != null
                    ? `Oldest waiting ${oldestOnlineAgeMin}m`
                    : 'Awaiting confirmation'
              }
              tone={
                oldestOnlineAgeMin != null && oldestOnlineAgeMin > 5
                  ? 'warn'
                  : 'neutral'
              }
            />
          </Link>
          <Link href={`${base}/floor`} className="contents">
            <LiveTile
              label="Tables occupied"
              icon="table_bar"
              value={`${tablesOccupied} / ${floorTables.length}`}
              caption={
                tablesCleaning > 0 ? `${tablesCleaning} cleaning` : 'Floor steady'
              }
            />
          </Link>
          <Link href={`${base}/kds`} className="contents">
            <LiveTile
              label="Kitchen queue"
              icon="restaurant"
              value={kitchenTickets.length}
              caption={
                kitchenTickets.length === 0
                  ? 'Nothing firing'
                  : oldestKitchenAgeMin != null
                    ? `Oldest ${oldestKitchenAgeMin}m`
                    : '—'
              }
              tone={
                oldestKitchenAgeMin != null && oldestKitchenAgeMin > 15
                  ? 'warn'
                  : 'neutral'
              }
            />
          </Link>
        </div>
      </section>

      {/* Band 2 — Today's pace */}
      <section className="flex flex-col gap-2">
        <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Today vs same weekday last week
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Net sales today"
            value={formatMoney(today?.netSalesCents ?? 0, currency)}
            subValue={renderDelta(netDelta, (cents) => formatMoney(cents, currency))}
            testId="kpi-net-sales-today"
          />
          <KpiCard
            label="Tickets today"
            value={today?.closedTicketCount ?? 0}
            subValue={renderDelta(ticketDelta, (n) => `${n > 0 ? '+' : ''}${n}`)}
            testId="kpi-tickets-today"
          />
          <KpiCard
            label="Avg ticket"
            value={formatMoney(today?.averageTicketCents ?? 0, currency)}
            subValue={renderDelta(avgDelta, (cents) => formatMoney(cents, currency))}
            testId="kpi-avg-ticket-today"
          />
          <KpiCard
            label="Unique guests"
            value={today?.uniqueGuests ?? 0}
            testId="kpi-unique-guests-today"
          />
          <LaborKpi tone={laborTone} pct={laborPctNum} />
        </div>
      </section>

      {/* Band 3 — Charts */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Today · revenue by hour"
          testId="dashboard-spark-card"
        >
          {sparkData.length === 0 || sparkData.every((p) => p.value === 0) ? (
            <EmptyChart message="No sales yet today — chart fills in as tickets close." />
          ) : (
            <LineChart
              data={sparkData}
              xTickFormatter={(h) => `${h}:00`}
              yTickFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
              valueFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
              testId="dashboard-spark"
              height={220}
            />
          )}
        </ChartCard>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Top 5 items today</h3>
          <DataTable
            rows={topRows}
            columns={topItemColumns(currency)}
            rowKey={(r) => r.menuItemId ?? ''}
            emptyTitle="Nothing closed yet today"
            emptyDescription="Top items appear once tickets close."
          />
        </div>
      </section>

      <ChartCard
        title="Last 30 days · revenue by weekday"
        testId="dashboard-dow-card"
      >
        {dowChartData.every((d) => d.value === 0) ? (
          <EmptyChart message="No revenue data yet — bars appear after closed tickets accumulate." />
        ) : (
          <BarChart
            data={dowChartData}
            yTickFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
            valueFormatter={(v) => formatMoney(Math.round(v * 100), currency)}
            testId="dashboard-dow"
            height={220}
          />
        )}
      </ChartCard>

      {/* Band 4 — Recent activity */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Recent activity
          </h2>
          <Link
            href={`${base}/tickets`}
            className="text-sm font-medium text-primary hover:underline"
          >
            View full history →
          </Link>
        </div>
        <RecentActivityList rows={recentTickets} currency={currency} />
      </section>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────

interface LiveTileProps {
  label: string;
  icon: string;
  value: React.ReactNode;
  caption: React.ReactNode;
  tone?: 'neutral' | 'warn';
}

function LiveTile({
  label,
  icon,
  value,
  caption,
  tone = 'neutral',
}: LiveTileProps): React.JSX.Element {
  const captionClass =
    tone === 'warn'
      ? 'text-amber-600 dark:text-amber-300'
      : 'text-on-surface-variant';
  return (
    <div className="flex h-full cursor-pointer flex-col gap-1 rounded-xl border bg-card p-card-padding shadow-sm transition-colors hover:border-primary/30 hover:bg-card/80">
      <div className="flex items-center gap-2 text-on-surface-variant">
        <span aria-hidden className="material-symbols-outlined text-[18px]">
          {icon}
        </span>
        <span className="font-label-caps text-label-caps uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="font-display text-display-md font-bold tabular-nums text-on-surface">
        {value}
      </div>
      <div className={`text-status-pill ${captionClass}`}>{caption}</div>
    </div>
  );
}

function LaborKpi({
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

function EmptyChart({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function RecentActivityList({
  rows,
  currency,
}: {
  rows: TicketEdge[];
  currency: string;
}): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No closed tickets yet today. Recently-closed tickets land here once
        tenders capture.
      </div>
    );
  }
  return (
    <ul
      className="flex flex-col rounded-xl border bg-card"
      data-testid="dashboard-recent-activity"
    >
      {rows.map((edge, idx) => {
        const t = edge?.node;
        if (!t) return null;
        const closedAt = t.closedAt ? new Date(t.closedAt as string) : null;
        const closedLabel = closedAt
          ? formatRelativeTime(closedAt)
          : 'unknown time';
        const statusTone =
          t.status === 'VOIDED'
            ? 'text-rose-700 dark:text-rose-300'
            : 'text-emerald-700 dark:text-emerald-300';
        return (
          <li
            key={t.id ?? idx}
            className="flex items-center justify-between border-b px-4 py-3 text-sm last:border-b-0"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-medium text-on-surface">
                #{t.shortNumber ?? '—'} ·{' '}
                <span className={statusTone}>{(t.status ?? '').toLowerCase()}</span>
                {t.customerLabel ? (
                  <span className="text-on-surface-variant"> · {t.customerLabel}</span>
                ) : null}
              </span>
              <span className="text-status-pill text-on-surface-variant">
                {closedLabel}
                {t.openedBy?.name ? ` · by ${t.openedBy.name}` : ''}
                {t.orderType ? ` · ${t.orderType.replace('_', '-').toLowerCase()}` : ''}
              </span>
            </div>
            <span className="shrink-0 font-semibold tabular-nums text-on-surface">
              {formatMoney(t.totalCents ?? 0, currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function topItemColumns(currency: string): Column<TopItemRow>[] {
  return [
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
}

interface Delta {
  /** Today minus same weekday last week. */
  absolute: number;
  /** Percent change as a 0-100 number, or null when last-week was zero. */
  percent: number | null;
  /** True when last week had no data — the absolute is the same number. */
  newSignal: boolean;
}

function deltaMoney(
  today: number | null | undefined,
  lastWeek: number | null | undefined,
): Delta {
  const t = today ?? 0;
  const l = lastWeek ?? 0;
  const absolute = t - l;
  const percent = l === 0 ? null : (absolute / l) * 100;
  return { absolute, percent, newSignal: l === 0 };
}

function deltaCount(
  today: number | null | undefined,
  lastWeek: number | null | undefined,
): Delta {
  return deltaMoney(today, lastWeek);
}

function renderDelta(
  delta: Delta,
  formatAbs: (value: number) => string,
): React.ReactNode {
  if (delta.newSignal) {
    return (
      <span className="text-emerald-700 dark:text-emerald-300">
        new — no baseline
      </span>
    );
  }
  if (delta.absolute === 0) {
    return <span className="text-on-surface-variant">flat vs last week</span>;
  }
  const up = delta.absolute > 0;
  const arrow = up ? '↑' : '↓';
  const tint = up
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-rose-700 dark:text-rose-300';
  const pctLabel =
    delta.percent != null
      ? ` (${up ? '+' : ''}${delta.percent.toFixed(1)}%)`
      : '';
  return (
    <span className={tint}>
      {arrow} {formatAbs(Math.abs(delta.absolute))}
      {pctLabel}
    </span>
  );
}

function computeOldestAgeMinutes(
  timestamps: ReadonlyArray<string | null>,
): number | null {
  const now = Date.now();
  let oldest: number | null = null;
  for (const ts of timestamps) {
    if (!ts) continue;
    const at = new Date(ts).getTime();
    if (Number.isNaN(at)) continue;
    const ageMin = Math.floor((now - at) / 60_000);
    if (oldest == null || ageMin > oldest) oldest = ageMin;
  }
  return oldest;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
