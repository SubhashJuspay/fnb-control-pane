'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { DataTable, formatMoney, KpiCard, type Column } from '@repo/ui';
import {
  LaborCostDocument,
  type LaborCostQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import {
  DateRangePicker,
  defaultDateRange,
  type DateRange,
} from './date-range-picker';
import { toDateRangeInput } from './date-range-input';
import { DownloadCsvButton } from './download-csv';

type StaffRow = NonNullable<
  NonNullable<LaborCostQuery['laborCost']>['perStaff']
>[number];

/**
 * Labor cost report for managers. Shows total labor hours, total labor cost,
 * net-sales revenue, and the labor-cost ratio (labor ÷ revenue). Per-staff
 * breakdown table sortable + CSV-exportable. Healthy targets cited inline:
 * full-service kitchens typically aim for < 30% labor cost.
 */
export function LaborReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const variables = useMemo(
    () => ({ dateRange: toDateRangeInput(range) }),
    [range],
  );
  const currency = useLocationCurrency();

  const [{ data, fetching, error }] = useQuery({
    query: LaborCostDocument,
    variables,
  });
  const summary = data?.laborCost ?? null;
  const rows: StaffRow[] = (summary?.perStaff ?? []).filter(
    (r): r is StaffRow => r != null,
  );

  const laborPct = (summary?.laborCostPct ?? 0) * 100;
  const ratingTone =
    !summary || summary.revenueCents === 0
      ? 'neutral'
      : laborPct <= 25
        ? 'good'
        : laborPct <= 35
          ? 'warning'
          : 'danger';

  const columns: Column<StaffRow>[] = [
    { key: 'name', header: 'Staff', cell: (r) => r.userName ?? '—' },
    {
      key: 'role',
      header: 'Role',
      cell: (r) => r.jobRoleName ?? '—',
    },
    {
      key: 'shifts',
      header: 'Shifts',
      className: 'text-right tabular-nums',
      cell: (r) => r.shifts ?? 0,
    },
    {
      key: 'hours',
      header: 'Hours',
      className: 'text-right tabular-nums',
      cell: (r) => (r.hours ?? 0).toFixed(2),
    },
    {
      key: 'rate',
      header: 'Rate',
      className: 'text-right tabular-nums',
      cell: (r) =>
        r.hourlyRateCents != null
          ? `${formatMoney(r.hourlyRateCents, currency)}/h`
          : '—',
    },
    {
      key: 'cost',
      header: 'Labor cost',
      className: 'text-right tabular-nums font-semibold',
      cell: (r) => formatMoney(r.laborCostCents ?? 0, currency),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="ml-auto">
          <DownloadCsvButton
            filename="labor-cost"
            rows={rows}
            columns={[
              { header: 'Staff', value: (r) => r.userName ?? '' },
              { header: 'Role', value: (r) => r.jobRoleName ?? '' },
              { header: 'Shifts', value: (r) => r.shifts ?? 0 },
              { header: 'Hours', value: (r) => (r.hours ?? 0).toFixed(2) },
              {
                header: 'Hourly rate cents',
                value: (r) => r.hourlyRateCents ?? '',
              },
              { header: 'Labor cost cents', value: (r) => r.laborCostCents ?? 0 },
            ]}
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Net sales revenue"
          value={formatMoney(summary?.revenueCents ?? 0, currency)}
        />
        <KpiCard
          label="Total labor hours"
          value={(summary?.totalHours ?? 0).toFixed(2)}
        />
        <KpiCard
          label="Total labor cost"
          value={formatMoney(summary?.totalLaborCostCents ?? 0, currency)}
        />
        <div
          className={[
            'flex flex-col gap-1 rounded-xl border p-card-padding shadow-card-soft',
            ratingTone === 'good'
              ? 'border-success/40 bg-success-container'
              : ratingTone === 'warning'
                ? 'border-warning/40 bg-warning-container'
                : ratingTone === 'danger'
                  ? 'border-error/40 bg-error-container'
                  : 'border-outline-variant bg-surface-container-lowest',
          ].join(' ')}
          data-tone={ratingTone}
        >
          <p className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Labor cost
          </p>
          <p
            className={[
              'font-display text-headline-md font-bold tabular-nums',
              ratingTone === 'good'
                ? 'text-on-success-container'
                : ratingTone === 'warning'
                  ? 'text-on-warning-container'
                  : ratingTone === 'danger'
                    ? 'text-on-error-container'
                    : 'text-on-surface',
            ].join(' ')}
          >
            {laborPct.toFixed(1)}%
          </p>
          <p className="text-status-pill text-on-surface-variant">
            Healthy target: &lt; 30% of net sales.
          </p>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.userId ?? ''}
        emptyTitle={fetching ? 'Loading…' : 'No clock-in data in range'}
        emptyDescription={
          fetching
            ? undefined
            : 'Labor cost is computed from TimeEntry × EmploymentProfile.hourlyRate. Make sure staff have rates set and have clocked in for shifts in the selected range.'
        }
      />
    </div>
  );
}
