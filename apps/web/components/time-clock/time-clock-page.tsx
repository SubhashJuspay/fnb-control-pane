'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useSubscription } from 'urql';
import { PunchClock, type PunchClockState } from '@repo/ui';
import { toast } from 'sonner';
import {
  MyActiveTimeEntryDocument,
  MyShiftsDocument,
  ScheduleUpdatesDocument,
  ShiftStatus,
  TimeClockEndBreakDocument,
  TimeClockPunchInDocument,
  TimeClockPunchOutDocument,
  TimeClockStartBreakDocument,
  type MyActiveTimeEntryQuery,
  type MyShiftsQuery,
} from '@/lib/graphql/generated/graphql';

interface TimeClockPageProps {
  locationId: string;
}

type ActiveEntry = NonNullable<MyActiveTimeEntryQuery['myActiveTimeEntry']>;
type Break = NonNullable<NonNullable<ActiveEntry['breaks']>[number]>;
type Shift = NonNullable<NonNullable<MyShiftsQuery['myShifts']>[number]>;

function formatTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayBounds(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function TimeClockPage({
  locationId,
}: TimeClockPageProps): React.JSX.Element {
  const [{ data, fetching }, refetchActive] = useQuery({
    query: MyActiveTimeEntryDocument,
    requestPolicy: 'cache-and-network',
  });
  const { from, to } = useMemo(() => todayBounds(), []);
  const [{ data: shiftsData }, refetchShifts] = useQuery({
    query: MyShiftsDocument,
    variables: { from, to },
  });

  const [{ fetching: punchingIn }, punchIn] = useMutation(
    TimeClockPunchInDocument,
  );
  const [{ fetching: punchingOut }, punchOut] = useMutation(
    TimeClockPunchOutDocument,
  );
  const [{ fetching: starting }, startBreak] = useMutation(
    TimeClockStartBreakDocument,
  );
  const [{ fetching: ending }, endBreak] = useMutation(
    TimeClockEndBreakDocument,
  );

  useSubscription({ query: ScheduleUpdatesDocument }, (_prev, payload) => {
    refetchActive({ requestPolicy: 'network-only' });
    refetchShifts({ requestPolicy: 'network-only' });
    return payload;
  });

  const refresh = (): void => {
    refetchActive({ requestPolicy: 'network-only' });
  };

  const active: ActiveEntry | null = data?.myActiveTimeEntry ?? null;
  const openBreak: Break | null = useMemo(() => {
    if (!active?.breaks) return null;
    return (
      active.breaks.find((b): b is Break => Boolean(b?.id) && !b?.endedAt) ??
      null
    );
  }, [active]);

  const state: PunchClockState = active
    ? openBreak
      ? 'ON_BREAK'
      : 'PUNCHED_IN'
    : 'NONE';
  const pending =
    fetching || punchingIn || punchingOut || starting || ending;

  const upcomingShifts: Shift[] = (shiftsData?.myShifts ?? []).filter(
    (s): s is Shift =>
      Boolean(s?.id) && (s?.status === ShiftStatus.Published),
  );
  const nextShift: Shift | null = useMemo(() => {
    const now = Date.now();
    const future = upcomingShifts.filter(
      (s) => new Date(s.startsAt as string).getTime() >= now,
    );
    future.sort(
      (a, b) =>
        new Date(a.startsAt as string).getTime() -
        new Date(b.startsAt as string).getTime(),
    );
    const candidate = future[0] ?? null;
    if (!candidate) return null;
    const minutesUntil =
      (new Date(candidate.startsAt as string).getTime() - now) / 60_000;
    return minutesUntil <= 60 ? candidate : null;
  }, [upcomingShifts]);

  const onPunchIn = async (): Promise<void> => {
    const result = await punchIn({
      input: {
        locationId,
        ...(nextShift?.id ? { shiftId: nextShift.id } : {}),
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Punched in');
    refresh();
  };
  const onPunchOut = async (): Promise<void> => {
    if (!active?.id) return;
    const id = active.id;
    const result = await punchOut({ input: { timeEntryId: id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Punched out');
    refresh();
  };
  const onStartBreak = async (): Promise<void> => {
    if (!active?.id) return;
    const id = active.id;
    const result = await startBreak({ input: { timeEntryId: id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Break started');
    refresh();
  };
  const onEndBreak = async (): Promise<void> => {
    if (!openBreak?.id) return;
    const id = openBreak.id;
    const result = await endBreak({ input: { breakId: id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Break ended');
    refresh();
  };

  const hint = state === 'NONE' && nextShift ? (
    <span>
      Next shift: {formatTime(nextShift.startsAt)} —{' '}
      {nextShift.jobRole?.name ?? 'Shift'}
    </span>
  ) : state === 'PUNCHED_IN' && active?.clockedInAt ? (
    <span>Clocked in at {formatTime(active.clockedInAt)}</span>
  ) : state === 'ON_BREAK' && openBreak?.startedAt ? (
    <span>On break since {formatTime(openBreak.startedAt)}</span>
  ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <PunchClock
        state={state}
        onPunchIn={onPunchIn}
        onPunchOut={onPunchOut}
        onStartBreak={onStartBreak}
        onEndBreak={onEndBreak}
        pending={pending}
        hint={hint}
      />
      <aside className="flex flex-col gap-3 rounded-md border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s activity
        </h2>
        {active ? (
          <ActivityLog active={active} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Not punched in. Activity from your last completed entry will not
            appear here — see Time entries for history.
          </p>
        )}
      </aside>
    </div>
  );
}

interface ActivityLogProps {
  active: ActiveEntry;
}

function ActivityLog({ active }: ActivityLogProps): React.JSX.Element {
  const breaks = (active.breaks ?? []).filter((b): b is Break => Boolean(b?.id));
  return (
    <ul className="flex flex-col gap-2 text-sm">
      <li className="flex items-center justify-between">
        <span className="font-medium">Punched in</span>
        <span className="font-mono">{formatTime(active.clockedInAt)}</span>
      </li>
      {breaks.map((b) => (
        <li key={b.id ?? ''} className="flex items-center justify-between">
          <span>
            Break {b.endedAt ? 'finished' : 'started'}
          </span>
          <span className="font-mono">
            {formatTime(b.startedAt)}
            {b.endedAt ? ` — ${formatTime(b.endedAt)}` : ' (open)'}
          </span>
        </li>
      ))}
    </ul>
  );
}
