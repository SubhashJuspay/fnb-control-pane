import * as React from 'react';

/**
 * Locally-mirrored shapes from `@repo/validation`'s `schedule.ts`. Kept
 * structural so callers can pass either the validation-typed value or a
 * plain object that follows the same shape.
 */
export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface ScheduleWindow {
  days: DayOfWeek[];
  start: string;
  end: string;
}

export type Schedule =
  | { kind: 'always' }
  | { kind: 'weekly'; windows: ScheduleWindow[] };

const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

const DAY_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * Render a Schedule into a single-line human-readable summary.
 *
 *   Always-on:               "Live 24/7"
 *   No windows:              "No windows"
 *   Contiguous run of days:  "Mon–Fri 6:00 AM–11:00 AM"
 *   Multiple windows:        joined by " • "
 *
 * Pure: no React, no hooks. Safe to call from anywhere.
 */
export function summarizeSchedule(schedule: Schedule): string {
  if (schedule.kind === 'always') return 'Live 24/7';
  if (schedule.windows.length === 0) return 'No windows';
  return schedule.windows.map(formatWindow).join(' • ');
}

function formatWindow(window: ScheduleWindow): string {
  const days = formatDays(window.days);
  const start = format12h(window.start);
  const end = format12h(window.end);
  return `${days} ${start}–${end}`;
}

function formatDays(days: DayOfWeek[]): string {
  if (days.length === 0) return '';
  // Map -> sorted indices into the canonical week order, then collapse runs.
  const indices = Array.from(new Set(days.map((d) => DAY_ORDER.indexOf(d))))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const i of indices) {
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) {
      last[1] = i;
    } else {
      runs.push([i, i]);
    }
  }
  return runs
    .map(([s, e]) => {
      const startLabel = DAY_LABEL[DAY_ORDER[s]!];
      if (s === e) return startLabel;
      return `${startLabel}–${DAY_LABEL[DAY_ORDER[e]!]}`;
    })
    .join(', ');
}

function format12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export interface ScheduleSummaryProps {
  schedule: Schedule;
  className?: string;
}

/**
 * Plain-text rendering of a schedule. Wrapper around `summarizeSchedule` so
 * pages can drop it in inline without manually composing the string.
 */
export function ScheduleSummary({ schedule, className }: ScheduleSummaryProps): React.JSX.Element {
  return <span className={className}>{summarizeSchedule(schedule)}</span>;
}

