'use client';

import * as React from 'react';
import { cn } from '../lib/cn.js';
import { Button } from '../components/button.js';

export type PunchClockState = 'NONE' | 'PUNCHED_IN' | 'ON_BREAK';

export interface PunchClockProps {
  state: PunchClockState;
  onPunchIn?: () => void;
  onPunchOut?: () => void;
  onStartBreak?: () => void;
  onEndBreak?: () => void;
  /** Disable all actions while a mutation is in flight. */
  pending?: boolean;
  /** Optional helper line below the buttons (e.g. "Next shift in 12 min"). */
  hint?: React.ReactNode;
  className?: string;
}

/**
 * Kiosk-style punch clock primitive. Renders state-conditional buttons:
 *
 * - `NONE`        → big "Punch in" button.
 * - `PUNCHED_IN`  → "Punch out" + "Start break".
 * - `ON_BREAK`    → "End break" + "Punch out".
 *
 * Headless about timing — callers wire up the GraphQL mutations and pass
 * down `pending` to disable buttons during the round-trip.
 */
export function PunchClock({
  state,
  onPunchIn,
  onPunchOut,
  onStartBreak,
  onEndBreak,
  pending = false,
  hint,
  className,
}: PunchClockProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-stretch gap-3 rounded-lg border bg-card p-6',
        className,
      )}
    >
      {state === 'NONE' ? (
        <Button
          size="lg"
          className="h-20 text-2xl font-semibold"
          onClick={onPunchIn}
          disabled={pending}
        >
          Punch in
        </Button>
      ) : null}
      {state === 'PUNCHED_IN' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            variant="destructive"
            className="h-20 flex-1 text-xl font-semibold"
            onClick={onPunchOut}
            disabled={pending}
          >
            Punch out
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-20 flex-1 text-xl font-semibold"
            onClick={onStartBreak}
            disabled={pending}
          >
            Start break
          </Button>
        </div>
      ) : null}
      {state === 'ON_BREAK' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="h-20 flex-1 text-xl font-semibold"
            onClick={onEndBreak}
            disabled={pending}
          >
            End break
          </Button>
          <Button
            size="lg"
            variant="destructive"
            className="h-20 flex-1 text-xl font-semibold"
            onClick={onPunchOut}
            disabled={pending}
          >
            Punch out
          </Button>
        </div>
      ) : null}
      {hint ? (
        <p className="text-center text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
