'use client';

import { useMemo } from 'react';
import { useQuery, useSubscription } from 'urql';
import { EmptyState } from '@repo/ui';
import { CalendarClock } from 'lucide-react';
import {
  MyShiftsDocument,
  ScheduleUpdatesDocument,
  ShiftStatus,
  type MyShiftsQuery,
} from '@/lib/graphql/generated/graphql';

type Shift = NonNullable<NonNullable<MyShiftsQuery['myShifts']>[number]>;

function formatTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(value: unknown): { key: string; label: string } {
  const d = new Date(value as string);
  const key = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  return { key, label };
}

/**
 * Read-only list of the viewer's upcoming PUBLISHED shifts at the active
 * location, grouped by day. Re-fetches on every `scheduleUpdates` event so a
 * manager publish/cancel flips the list in real time.
 */
export function MyScheduleList(): React.JSX.Element {
  const fromIso = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }, []);

  const [{ data, fetching, error }, refetch] = useQuery({
    query: MyShiftsDocument,
    variables: { from: fromIso },
    requestPolicy: 'cache-and-network',
  });

  useSubscription({ query: ScheduleUpdatesDocument }, (_prev, payload) => {
    refetch({ requestPolicy: 'network-only' });
    return payload;
  });

  const upcoming: Shift[] = useMemo(() => {
    return (data?.myShifts ?? []).filter(
      (s): s is Shift =>
        Boolean(s?.id) && (s?.status === ShiftStatus.Published),
    );
  }, [data]);

  const grouped = useMemo(() => {
    const out = new Map<string, { label: string; shifts: Shift[] }>();
    for (const s of upcoming) {
      const { key, label } = dayLabel(s.startsAt);
      const bucket = out.get(key);
      if (bucket) {
        bucket.shifts.push(s);
      } else {
        out.set(key, { label, shifts: [s] });
      }
    }
    return Array.from(out.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [upcoming]);

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your schedule: {error.message}
      </p>
    );
  }
  if (fetching && upcoming.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No upcoming shifts"
        description="When your manager publishes a shift for you, it will appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {grouped.map(([key, { label, shifts }]) => (
        <li key={key} className="rounded-md border bg-card">
          <header className="border-b px-4 py-2 text-sm font-medium">
            {label}
          </header>
          <ul className="divide-y">
            {shifts.map((s) => (
              <li
                key={s.id ?? key}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-3 rounded-full border"
                  style={{ background: s.jobRole?.color ?? '#6366f1' }}
                />
                <div className="flex flex-1 flex-col">
                  <span className="font-medium">
                    {s.jobRole?.name ?? 'Shift'}
                  </span>
                  {s.notes ? (
                    <span className="text-xs text-muted-foreground">
                      {s.notes}
                    </span>
                  ) : null}
                </div>
                <div className="font-mono text-sm">
                  {formatTime(s.startsAt)} — {formatTime(s.endsAt)}
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
