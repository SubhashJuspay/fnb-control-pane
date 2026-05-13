'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { ChartCard, KpiCard } from '@repo/ui';
import { GuestCohortDocument } from '@/lib/graphql/generated/graphql';
import {
  DateRangePicker,
  defaultDateRange,
  type DateRange,
} from './date-range-picker';
import { toDateRangeInput } from './date-range-input';
import { DownloadCsvButton } from './download-csv';

export function GuestsReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const variables = useMemo(
    () => ({ dateRange: toDateRangeInput(range) }),
    [range],
  );

  const [{ data, error }] = useQuery({
    query: GuestCohortDocument,
    variables,
  });
  const cohort = data?.guestCohort;
  const repeatRatePct = ((cohort?.repeatRate ?? 0) * 100).toFixed(1);

  const cohortRows = cohort
    ? [
        {
          fromDate: cohort.fromDate,
          toDate: cohort.toDate,
          newGuestCount: cohort.newGuestCount,
          returningGuestCount: cohort.returningGuestCount,
          repeatRate: cohort.repeatRate,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="ml-auto">
          <DownloadCsvButton
            filename="guest-cohort"
            rows={cohortRows}
            columns={[
              { header: 'From', value: (r) => String(r.fromDate ?? '') },
              { header: 'To', value: (r) => String(r.toDate ?? '') },
              { header: 'New guests', value: (r) => r.newGuestCount },
              { header: 'Returning guests', value: (r) => r.returningGuestCount },
              { header: 'Repeat rate', value: (r) => (r.repeatRate ?? 0).toFixed(4) },
            ]}
          />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard
          label="New guests"
          value={cohort?.newGuestCount ?? 0}
          testId="kpi-new-guests"
        />
        <KpiCard
          label="Returning guests"
          value={cohort?.returningGuestCount ?? 0}
          testId="kpi-returning-guests"
        />
        <KpiCard
          label="Repeat rate"
          value={`${repeatRatePct}%`}
          testId="kpi-repeat-rate"
        />
      </div>
      <ChartCard
        title="About this report"
        subtitle="Guests are tagged 'new' if their first visit at this location falls inside the range, 'returning' if their first visit pre-dates the range and they had at least one visit inside it."
      >
        <p className="text-sm text-muted-foreground">
          Linked tickets only — anonymous tickets without a guest are excluded
          from the cohort calculation.
        </p>
      </ChartCard>
    </div>
  );
}
