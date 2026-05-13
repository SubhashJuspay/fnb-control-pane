'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import {
  DataTable,
  formatMoney,
  type Column,
} from '@repo/ui';
import {
  TopItemsDocument,
  TopItemsSort,
  type TopItemsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import {
  DateRangePicker,
  defaultDateRange,
  type DateRange,
} from './date-range-picker';
import { toDateRangeInput } from './date-range-input';
import { DownloadCsvButton } from './download-csv';

type TopItemRow = NonNullable<NonNullable<TopItemsQuery['topItems']>[number]>;

const SORT_LABEL: Record<TopItemsSort, string> = {
  [TopItemsSort.Quantity]: 'Quantity',
  [TopItemsSort.Revenue]: 'Revenue',
  [TopItemsSort.Tickets]: 'Tickets',
};

export function ItemsReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const [sort, setSort] = useState<TopItemsSort>(TopItemsSort.Quantity);
  const currency = useLocationCurrency();
  const variables = useMemo(
    () => ({ dateRange: toDateRangeInput(range), by: sort, limit: 25 }),
    [range, sort],
  );
  const [{ data, fetching, error }] = useQuery({
    query: TopItemsDocument,
    variables,
  });

  const rows: TopItemRow[] = (data?.topItems ?? []).filter(
    (r): r is TopItemRow => r != null,
  );

  const columns: Column<TopItemRow>[] = [
    {
      key: 'name',
      header: 'Item',
      cell: (row) => row.menuItemName ?? '—',
    },
    {
      key: 'quantity',
      header: 'Qty',
      className: 'text-right tabular-nums',
      cell: (row) => row.quantitySold ?? 0,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      className: 'text-right tabular-nums',
      cell: (row) => formatMoney(row.revenueCents ?? 0, currency),
    },
    {
      key: 'tickets',
      header: 'Tickets',
      className: 'text-right tabular-nums',
      cell: (row) => row.ticketCount ?? 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" htmlFor="items-sort">
            Sort by
          </label>
          <select
            id="items-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as TopItemsSort)}
            className="h-8 rounded-md border bg-surface px-2 text-sm"
            data-input="sort"
          >
            {Object.values(TopItemsSort).map((option) => (
              <option key={option} value={option}>
                {SORT_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          <DownloadCsvButton
            filename="top-items"
            rows={rows}
            columns={[
              { header: 'Item', value: (r) => r.menuItemName ?? '' },
              { header: 'Quantity', value: (r) => r.quantitySold ?? 0 },
              { header: 'Revenue cents', value: (r) => r.revenueCents ?? 0 },
              { header: 'Tickets', value: (r) => r.ticketCount ?? 0 },
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
        rowKey={(row) => row.menuItemId ?? ''}
        emptyTitle={fetching ? 'Loading…' : 'No items in range'}
        emptyDescription={
          fetching
            ? undefined
            : 'Once tickets close in this range their items will appear here.'
        }
      />
    </div>
  );
}
