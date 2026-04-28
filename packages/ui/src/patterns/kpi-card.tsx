import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface KpiCardProps {
  /** Label rendered above the primary number, e.g. "Net sales today". */
  label: string;
  /** Primary number, already formatted (e.g. "$487", "12"). */
  value: React.ReactNode;
  /** Optional smaller sub-value, e.g. "vs $321 yesterday" or a delta. */
  subValue?: React.ReactNode;
  className?: string;
  /**
   * Optional accessibility hint when the consumer provides a complex `value`
   * node (e.g. icons + number); falls back to the label.
   */
  ariaLabel?: string;
  /** Optional `data-testid` so e2e specs can look up KPIs by key. */
  testId?: string;
}

/**
 * Compact KPI tile used on the dashboard. The number is intentionally large
 * so a quick glance works on the line cook iPad mounted in the back office.
 * Consumers format the value (we don't take cents/currency directly) so the
 * same primitive works for currency, counts, and percentages.
 */
export function KpiCard({
  label,
  value,
  subValue,
  className,
  ariaLabel,
  testId,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border bg-surface p-4 shadow-sm',
        className,
      )}
      aria-label={ariaLabel ?? label}
      data-testid={testId}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className="text-3xl font-semibold tabular-nums"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
      </p>
      {subValue ? (
        <p className="text-xs text-muted-foreground">{subValue}</p>
      ) : null}
    </div>
  );
}
