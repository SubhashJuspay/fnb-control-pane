import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  /** Optional data-testid so e2e specs can find the card wrapper. */
  testId?: string;
}

/**
 * Header + body card used to wrap recharts wrappers. Keeps the shell
 * consistent across the dashboard and insights pages so individual charts
 * don't have to repeat heading/padding scaffolding.
 */
export function ChartCard({
  title,
  subtitle,
  children,
  className,
  testId,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-sm',
        className,
      )}
      data-testid={testId}
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      <div className="min-h-[200px]">{children}</div>
    </div>
  );
}
