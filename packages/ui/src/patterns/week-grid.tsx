'use client';

import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface WeekGridUser {
  id: string;
  name: string;
  subtitle?: string | null;
}

export interface WeekGridProps {
  users: WeekGridUser[];
  /** UTC instant anchoring the start of the week. Used to render column day labels. */
  weekStart: Date;
  /**
   * Map keyed by `${userId}|${dayKey}` where `dayKey` is the YYYY-MM-DD of
   * the day in the caller's display timezone. Returns the cell content
   * (typically rendered shift chips). Empty cells render an "+ add" affordance.
   */
  cells: Map<string, React.ReactNode>;
  /** Called when an empty cell or the "+ add" button is clicked. */
  onCellClick?: (userId: string, day: Date) => void;
  /**
   * Optional label for each column. Defaults to `Mon`, `Tue`, … in the
   * locale's short-weekday format derived from the user's browser timezone.
   */
  formatColumnDate?: (day: Date) => { label: string; sub: string };
  className?: string;
}

/** Build the YYYY-MM-DD key for a date in UTC. Stable for consumers. */
export function dayKey(day: Date): string {
  const y = day.getUTCFullYear();
  const m = String(day.getUTCMonth() + 1).padStart(2, '0');
  const d = String(day.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Compose a stable cell-map key for a (userId, dayKey) pair. */
export function cellKey(userId: string, day: Date): string {
  return `${userId}|${dayKey(day)}`;
}

const DEFAULT_FORMAT_COLUMN: NonNullable<WeekGridProps['formatColumnDate']> = (
  day,
) => ({
  label: day.toLocaleDateString(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  }),
  sub: day.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
});

/**
 * Week grid primitive: rows = users, cols = 7 days. Cells receive
 * pre-rendered React content via `cells` (e.g. shift chips). Click handlers
 * fire on whichever cell is targeted. Stays headless re: business logic —
 * no concept of shifts, schedules, or locations here.
 *
 * Layout uses CSS grid with `auto-rows` rather than fixed heights so callers
 * can render multiple chips per cell and the row grows naturally.
 */
export function WeekGrid({
  users,
  weekStart,
  cells,
  onCellClick,
  formatColumnDate = DEFAULT_FORMAT_COLUMN,
  className,
}: WeekGridProps): React.JSX.Element {
  const days = React.useMemo<Date[]>(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      out.push(new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000));
    }
    return out;
  }, [weekStart]);
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div
        className="grid min-w-[64rem] gap-px rounded-md border bg-border"
        style={{ gridTemplateColumns: 'minmax(10rem, 14rem) repeat(7, minmax(0, 1fr))' }}
      >
        {/* header row */}
        <div className="bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Member
        </div>
        {days.map((d) => {
          const fmt = formatColumnDate(d);
          return (
            <div
              key={d.toISOString()}
              className="bg-muted px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              <div>{fmt.label}</div>
              <div className="text-[11px] normal-case text-muted-foreground/80">
                {fmt.sub}
              </div>
            </div>
          );
        })}

        {/* body rows */}
        {users.map((user) => (
          <React.Fragment key={user.id}>
            <div className="flex flex-col justify-center bg-card px-3 py-2 text-sm">
              <span className="font-medium">{user.name}</span>
              {user.subtitle ? (
                <span className="text-xs text-muted-foreground">
                  {user.subtitle}
                </span>
              ) : null}
            </div>
            {days.map((d) => {
              const key = cellKey(user.id, d);
              const content = cells.get(key);
              const hasContent = content != null;
              // When the cell has content, the content (e.g. ShiftChip) is
              // itself an interactive `<button>` — nesting a button inside a
              // button is invalid HTML and triggers a React hydration error.
              // Render the cell as a `<div>` in that case; the cell content
              // is responsible for its own click. Empty cells stay as
              // `<button>` so the "+ add" affordance is keyboard-clickable
              // and onCellClick fires for the "create new shift" flow.
              if (hasContent) {
                return (
                  <div
                    key={key}
                    className="group relative flex min-h-[3.5rem] flex-col items-stretch justify-start gap-1 bg-card p-1 text-left"
                    aria-label={`${user.name} ${dayKey(d)}`}
                  >
                    <div className="flex flex-col gap-1">{content}</div>
                  </div>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onCellClick?.(user.id, d)}
                  className={cn(
                    'group relative flex min-h-[3.5rem] flex-col items-stretch justify-start gap-1 bg-card p-1 text-left text-muted-foreground transition-colors hover:bg-accent/40',
                  )}
                  aria-label={`${user.name} ${dayKey(d)}`}
                >
                  <span className="invisible self-end pr-1 text-xs group-hover:visible">
                    + add
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
