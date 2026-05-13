'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import {
  DataTable,
  formatMoney,
  type Column,
} from '@repo/ui';
import {
  ServerPerformanceDocument,
  type ServerPerformanceQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import {
  DateRangePicker,
  defaultDateRange,
  type DateRange,
} from './date-range-picker';
import { toDateRangeInput } from './date-range-input';
import { DownloadCsvButton } from './download-csv';

type Row = NonNullable<NonNullable<ServerPerformanceQuery['serverPerformance']>[number]>;

export function ServersReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const variables = useMemo(
    () => ({ dateRange: toDateRangeInput(range) }),
    [range],
  );
  const currency = useLocationCurrency();

  const [{ data, fetching, error }] = useQuery({
    query: ServerPerformanceDocument,
    variables,
  });
  const rows: Row[] = (data?.serverPerformance ?? []).filter(
    (r): r is Row => r != null,
  );

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Server', cell: (r) => r.openedByName ?? '—' },
    {
      key: 'tickets',
      header: 'Tickets',
      className: 'text-right tabular-nums',
      cell: (r) => r.ticketCount ?? 0,
    },
    {
      key: 'items',
      header: 'Items',
      className: 'text-right tabular-nums',
      cell: (r) => r.itemsServed ?? 0,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      className: 'text-right tabular-nums',
      cell: (r) => formatMoney(r.revenueCents ?? 0, currency),
    },
    {
      key: 'avg',
      header: 'Avg ticket',
      className: 'text-right tabular-nums',
      cell: (r) => formatMoney(r.averageTicketCents ?? 0, currency),
    },
    {
      key: 'voidRate',
      header: 'Void rate',
      className: 'text-right tabular-nums',
      cell: (r) => `${((r.voidRate ?? 0) * 100).toFixed(1)}%`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="ml-auto">
          <DownloadCsvButton
            filename="server-performance"
            rows={rows}
            columns={[
              { header: 'Server', value: (r) => r.openedByName ?? '' },
              { header: 'Tickets', value: (r) => r.ticketCount ?? 0 },
              { header: 'Items', value: (r) => r.itemsServed ?? 0 },
              { header: 'Revenue cents', value: (r) => r.revenueCents ?? 0 },
              { header: 'Avg ticket cents', value: (r) => r.averageTicketCents ?? 0 },
              { header: 'Void rate', value: (r) => (r.voidRate ?? 0).toFixed(4) },
            ]}
          />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.openedById ?? ''}
        emptyTitle={fetching ? 'Loading…' : 'No tickets in range'}
        emptyDescription={
          fetching
            ? undefined
            : 'Server-level performance shows up once tickets close in this range.'
        }
      />
    </div>
  );
}
