'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useSubscription } from 'urql';
import { Button, WeekGrid, cellKey, type WeekGridUser } from '@repo/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  JobRolesDocument,
  ScheduleForWeekDocument,
  ScheduleUpdatesDocument,
  ShiftStatus,
  StaffDuplicateWeekDocument,
  StaffPublishWeekDocument,
  StaffRosterDocument,
  type JobRolesQuery,
  type ScheduleForWeekQuery,
  type StaffRosterQuery,
} from '@/lib/graphql/generated/graphql';
import { NewShiftDialog } from '@/components/schedule/new-shift-dialog';
import { EditShiftPopover } from '@/components/schedule/edit-shift-popover';

type Shift = NonNullable<NonNullable<ScheduleForWeekQuery['scheduleForWeek']>[number]>;
type JobRole = NonNullable<NonNullable<JobRolesQuery['jobRoles']>[number]>;
type StaffProfile = NonNullable<NonNullable<StaffRosterQuery['staffRoster']>[number]>;

interface ScheduleEditorProps {
  locationId: string;
  locationTimezone: string;
}

/**
 * Compute the Monday-anchored UTC midnight that opens the local week
 * containing `now` in `tz`. We render the editor anchored to UTC midnight
 * because the api accepts a UTC `weekStart` and converts it via
 * `computeWeekRange` server-side.
 */
function computeWeekStart(now: Date, tz: string): Date {
  // Get the wall-clock parts in `tz`, then compute back the UTC instant of
  // local midnight on that Monday.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const get = (k: string): string =>
    parts.find((p) => p.type === k)?.value ?? '';
  const weekday = get('weekday');
  const day = Number(get('day'));
  const month = Number(get('month'));
  const year = Number(get('year'));
  const dayOffsets: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = dayOffsets[weekday] ?? 0;
  // Compute a Date in UTC for the local Monday's calendar day, then re-anchor
  // to UTC midnight — `computeWeekRange` on the server reads the `tz` and
  // does the same calendar-day extraction, so the absolute UTC instant we
  // ship doesn't have to match local midnight here.
  const monday = new Date(Date.UTC(year, month - 1, day - offset));
  return monday;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDayKey(shift: Shift): string {
  if (!shift.startsAt) return '';
  const d = new Date(shift.startsAt as string);
  // Use the calendar day of the local time. Offset is stable from the
  // browser; not perfect with DST cutovers but sufficient for grid bucketing.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(value: unknown): string {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ScheduleEditor({
  locationId,
  locationTimezone,
}: ScheduleEditorProps): React.JSX.Element {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    computeWeekStart(new Date(), locationTimezone),
  );

  const [{ data: scheduleData, fetching }, refetchSchedule] = useQuery({
    query: ScheduleForWeekDocument,
    variables: { weekStart: weekStart.toISOString() },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: rosterData }] = useQuery({ query: StaffRosterDocument });
  const [{ data: jobRolesData }] = useQuery({ query: JobRolesDocument });

  const [, publishWeek] = useMutation(StaffPublishWeekDocument);
  const [, duplicateWeek] = useMutation(StaffDuplicateWeekDocument);

  useSubscription({ query: ScheduleUpdatesDocument }, (_prev, payload) => {
    refetchSchedule({ requestPolicy: 'network-only' });
    return payload;
  });

  const profiles: StaffProfile[] = (rosterData?.staffRoster ?? []).filter(
    (p): p is StaffProfile => p != null,
  );
  const shifts: Shift[] = (scheduleData?.scheduleForWeek ?? []).filter(
    (s): s is Shift => s != null,
  );
  const jobRoles: JobRole[] = (jobRolesData?.jobRoles ?? []).filter(
    (r): r is JobRole => r != null && r.archivedAt == null,
  );

  const users: WeekGridUser[] = useMemo(() => {
    const seen = new Map<string, WeekGridUser>();
    for (const p of profiles) {
      const u = p.user;
      if (!u?.id) continue;
      if (seen.has(u.id)) continue;
      seen.set(u.id, {
        id: u.id,
        name: u.name ?? u.email ?? 'Unknown',
        subtitle: p.employmentType ?? null,
      });
    }
    // Also include any user that has a shift but no employment profile.
    for (const s of shifts) {
      const u = s.user;
      if (!u?.id || seen.has(u.id)) continue;
      seen.set(u.id, {
        id: u.id,
        name: u.name ?? u.email ?? 'Unknown',
        subtitle: null,
      });
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [profiles, shifts]);

  const cells = useMemo<Map<string, React.ReactNode>>(() => {
    const map = new Map<string, React.ReactNode[]>();
    for (const s of shifts) {
      if (!s.user?.id || !s.startsAt) continue;
      const dayKeyStr = shiftDayKey(s);
      // Each cell rendering targets weekStart + n days; re-derive `Date` here
      // matching dayKey logic in WeekGrid.
      const userId = s.user.id;
      const k = `${userId}|${dayKeyStr}`;
      const chip = (
        <ShiftChip
          key={s.id ?? `${userId}-${dayKeyStr}`}
          shift={s}
          onClickShift={() => setEditingShiftId(s.id ?? null)}
        />
      );
      const arr = map.get(k);
      if (arr) arr.push(chip);
      else map.set(k, [chip]);
    }
    const out = new Map<string, React.ReactNode>();
    for (const [k, arr] of map.entries()) {
      out.set(k, <>{arr}</>);
    }
    return out;
  }, [shifts]);

  // The week-grid expects keys derived from `cellKey(userId, day)`; convert
  // our `${userId}|${ymd(day)}` keys (ymd in UTC) into the expected keys by
  // scanning the grid's day list. To keep it simple, bucket by the calendar
  // day in the user's local timezone (matching what the grid does via UTC).
  // We render days at UTC midnight to avoid DST surprises here; the api
  // server does the calendar-day mapping.
  const cellsForGrid = useMemo<Map<string, React.ReactNode>>(() => {
    const out = new Map<string, React.ReactNode>();
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(weekStart, i);
      const dayKeyStr = ymd(day);
      for (const u of users) {
        const k = `${u.id}|${dayKeyStr}`;
        const value = cells.get(k);
        if (value != null) out.set(cellKey(u.id, day), value);
      }
    }
    return out;
  }, [cells, users, weekStart]);

  const draftCount = shifts.filter((s) => s.status === ShiftStatus.Draft).length;
  const publishedCount = shifts.filter(
    (s) => s.status === ShiftStatus.Published,
  ).length;

  const [newShift, setNewShift] = useState<{ userId: string; day: Date } | null>(
    null,
  );
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const editingShift = shifts.find((s) => s.id === editingShiftId) ?? null;

  const onPublishWeek = useCallback(async (): Promise<void> => {
    const result = await publishWeek({
      input: { locationId, weekStart: weekStart.toISOString() },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const count = result.data?.publishWeek?.length ?? 0;
    toast.success(`Published ${count} shift${count === 1 ? '' : 's'}`);
    refetchSchedule({ requestPolicy: 'network-only' });
  }, [locationId, publishWeek, refetchSchedule, weekStart]);

  const onDuplicateNextWeek = useCallback(async (): Promise<void> => {
    const target = addDays(weekStart, 7);
    const result = await duplicateWeek({
      input: {
        locationId,
        weekStart: weekStart.toISOString(),
        targetWeekStart: target.toISOString(),
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const count = result.data?.duplicateWeek?.length ?? 0;
    toast.success(
      `Duplicated ${count} shift${count === 1 ? '' : 's'} to next week`,
    );
    refetchSchedule({ requestPolicy: 'network-only' });
  }, [duplicateWeek, locationId, refetchSchedule, weekStart]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-mono text-sm">
            {ymd(weekStart)} — {ymd(addDays(weekStart, 6))}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(computeWeekStart(new Date(), locationTimezone))}
          >
            This week
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {publishedCount} published · {draftCount} draft
          </span>
          <Button variant="outline" size="sm" onClick={onDuplicateNextWeek}>
            Duplicate to next week
          </Button>
          <Button onClick={onPublishWeek} disabled={draftCount === 0}>
            Publish week
          </Button>
        </div>
      </div>

      {fetching && shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading schedule…</p>
      ) : (
        <WeekGrid
          users={users}
          weekStart={weekStart}
          cells={cellsForGrid}
          onCellClick={(userId, day) => setNewShift({ userId, day })}
        />
      )}

      <NewShiftDialog
        open={newShift !== null}
        onOpenChange={(o) => {
          if (!o) setNewShift(null);
        }}
        userId={newShift?.userId ?? ''}
        day={newShift?.day ?? weekStart}
        jobRoles={jobRoles}
        onCreated={() => {
          setNewShift(null);
          refetchSchedule({ requestPolicy: 'network-only' });
        }}
      />

      <EditShiftPopover
        shift={editingShift}
        onClose={() => setEditingShiftId(null)}
        jobRoles={jobRoles}
        onChanged={() => {
          setEditingShiftId(null);
          refetchSchedule({ requestPolicy: 'network-only' });
        }}
      />
    </div>
  );
}

interface ShiftChipProps {
  shift: Shift;
  onClickShift: () => void;
}

function ShiftChip({ shift, onClickShift }: ShiftChipProps): React.JSX.Element {
  const color = shift.jobRole?.color ?? '#6366f1';
  const isCancelled = shift.status === ShiftStatus.Cancelled;
  const isDraft = shift.status === ShiftStatus.Draft;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClickShift();
      }}
      className="flex flex-col rounded px-2 py-1 text-left text-xs leading-tight text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{
        background: color,
        opacity: isCancelled ? 0.5 : 1,
        textDecoration: isCancelled ? 'line-through' : undefined,
        outline: isDraft ? '2px dashed rgba(255,255,255,0.55)' : undefined,
        outlineOffset: -2,
      }}
    >
      <span className="font-mono">
        {formatTime(shift.startsAt)}–{formatTime(shift.endsAt)}
      </span>
      <span className="font-medium">{shift.jobRole?.name ?? 'Shift'}</span>
    </button>
  );
}
