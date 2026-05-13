'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { Button, formatMoney } from '@repo/ui';
import { Printer } from 'lucide-react';
import {
  HourlyMixDocument,
  SalesSummaryDocument,
  ServerPerformanceDocument,
  TopItemsDocument,
  TopItemsSort,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

interface EndOfDayReportProps {
  /** Tenant + location names rendered into the report header. */
  tenantName: string;
  locationName: string;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isoToRange(iso: string): { from: Date; to: Date } {
  // Whole-day range, expressed in local (browser) wall-clock. The API
  // re-buckets to the location's IANA timezone via the existing
  // resolveBusinessDayRange helper.
  const start = new Date(`${iso}T00:00:00`);
  const end = new Date(`${iso}T23:59:59.999`);
  return { from: start, to: end };
}

/**
 * Day-end "Z report" used for end-of-shift cash-out / handoff. Prints
 * cleanly on a normal letter-size sheet. Defaults to today; the date
 * picker is hidden when printing.
 */
export function EndOfDayReport({
  tenantName,
  locationName,
}: EndOfDayReportProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [iso, setIso] = useState<string>(todayIso());
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const range = useMemo(() => isoToRange(iso), [iso]);
  const dateRange = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range],
  );

  const [{ data: summary, fetching: summaryFetching }] = useQuery({
    query: SalesSummaryDocument,
    variables: { dateRange },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: hourly }] = useQuery({
    query: HourlyMixDocument,
    variables: { dateRange },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: top }] = useQuery({
    query: TopItemsDocument,
    variables: { dateRange, limit: 10, by: TopItemsSort.Quantity },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: servers }] = useQuery({
    query: ServerPerformanceDocument,
    variables: { dateRange },
    requestPolicy: 'cache-and-network',
  });

  const s = summary?.salesSummary ?? null;
  const hourlyRows =
    (hourly?.hourlyMix ?? []).filter((r): r is NonNullable<typeof r> => r != null);
  const topRows = (top?.topItems ?? []).filter(
    (r): r is NonNullable<typeof r> => r != null,
  );
  const serverRows = (servers?.serverPerformance ?? []).filter(
    (r): r is NonNullable<typeof r> => r != null,
  );

  const grandTotal = s
    ? (s.netSalesCents ?? 0) + (s.tipCents ?? 0) - (s.refundCents ?? 0)
    : 0;

  return (
    <div className="flex flex-col gap-5" data-testid="end-of-day-report">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">End-of-day report</h1>
          <p className="text-sm text-muted-foreground">
            Daily Z report. Defaults to today.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Date
            <input
              type="date"
              value={iso}
              max={todayIso()}
              onChange={(e) => setIso(e.target.value)}
              data-testid="end-of-day-date"
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
          </label>
          <Button
            type="button"
            onClick={() => window.print()}
            data-testid="end-of-day-print"
          >
            <Printer className="mr-2 size-4" />
            Print
          </Button>
        </div>
      </header>

      <article
        className="flex flex-col gap-5 rounded-xl border bg-card p-6 print:rounded-none print:border-0 print:p-0"
        data-testid="end-of-day-content"
      >
        <header className="flex flex-col gap-1 border-b pb-3">
          <p className="text-base font-semibold">{tenantName}</p>
          <p className="text-sm text-muted-foreground">{locationName}</p>
          <p className="text-xs text-muted-foreground">
            Business day {iso} · printed {now.toLocaleString()}
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Summary</h2>
          {summaryFetching && !s ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : s ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted-foreground">Closed tickets</dt>
              <dd className="text-right tabular-nums">{s.closedTicketCount ?? 0}</dd>
              <dt className="text-muted-foreground">Voided tickets</dt>
              <dd className="text-right tabular-nums">{s.voidedTicketCount ?? 0}</dd>
              <dt className="text-muted-foreground">Unique guests</dt>
              <dd className="text-right tabular-nums">{s.uniqueGuests ?? 0}</dd>
              <dt className="text-muted-foreground">Average ticket</dt>
              <dd className="text-right tabular-nums">
                {formatMoney(s.averageTicketCents ?? 0, currency)}
              </dd>
              <dt className="mt-1 border-t pt-1 text-muted-foreground">Gross sales</dt>
              <dd className="mt-1 border-t pt-1 text-right tabular-nums">
                {formatMoney(s.grossSalesCents ?? 0, currency)}
              </dd>
              <dt className="text-muted-foreground">Discounts</dt>
              <dd className="text-right tabular-nums">
                -{formatMoney(s.discountCents ?? 0, currency)}
              </dd>
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="text-right tabular-nums">
                {formatMoney(s.taxCents ?? 0, currency)}
              </dd>
              <dt className="font-semibold">Net sales</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatMoney(s.netSalesCents ?? 0, currency)}
              </dd>
              <dt className="mt-1 border-t pt-1 text-muted-foreground">Tips</dt>
              <dd className="mt-1 border-t pt-1 text-right tabular-nums">
                {formatMoney(s.tipCents ?? 0, currency)}
              </dd>
              <dt className="text-muted-foreground">Refunds</dt>
              <dd className="text-right tabular-nums text-rose-700">
                -{formatMoney(s.refundCents ?? 0, currency)}
              </dd>
              <dt className="border-t pt-1 font-semibold">Net to bank</dt>
              <dd className="border-t pt-1 text-right font-semibold tabular-nums">
                {formatMoney(grandTotal, currency)}
              </dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No data.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Sales by hour</h2>
          {hourlyRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tickets in this window.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b">
                <tr>
                  <th className="py-1 text-left font-medium">Hour</th>
                  <th className="py-1 text-right font-medium">Tickets</th>
                  <th className="py-1 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {hourlyRows.map((r) => (
                  <tr key={r.hour}>
                    <td className="py-1">
                      {String(r.hour ?? 0).padStart(2, '0')}:00
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {r.ticketCount ?? 0}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatMoney(r.revenueCents ?? 0, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Top items by quantity</h2>
          {topRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No items sold.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b">
                <tr>
                  <th className="py-1 text-left font-medium">Item</th>
                  <th className="py-1 text-right font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((r) => (
                  <tr key={r.menuItemId}>
                    <td className="py-1">{r.menuItemName}</td>
                    <td className="py-1 text-right tabular-nums">
                      {r.quantitySold ?? 0}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatMoney(r.revenueCents ?? 0, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Server performance</h2>
          {serverRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No closed tickets.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b">
                <tr>
                  <th className="py-1 text-left font-medium">Server</th>
                  <th className="py-1 text-right font-medium">Tickets</th>
                  <th className="py-1 text-right font-medium">Items</th>
                  <th className="py-1 text-right font-medium">Net</th>
                  <th className="py-1 text-right font-medium">Avg</th>
                  <th className="py-1 text-right font-medium">Voids</th>
                </tr>
              </thead>
              <tbody>
                {serverRows.map((r) => (
                  <tr key={r.openedById}>
                    <td className="py-1">{r.openedByName}</td>
                    <td className="py-1 text-right tabular-nums">{r.ticketCount ?? 0}</td>
                    <td className="py-1 text-right tabular-nums">{r.itemsServed ?? 0}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatMoney(r.revenueCents ?? 0, currency)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatMoney(r.averageTicketCents ?? 0, currency)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {((r.voidRate ?? 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </article>
    </div>
  );
}
