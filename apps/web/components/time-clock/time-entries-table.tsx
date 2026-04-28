'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import {
  Button,
  cn,
  DataTable,
  Input,
  Label,
  type Column,
} from '@repo/ui';
import {
  AdminTenantMembersDocument,
  TimeEntriesDocument,
  type TimeEntriesQuery,
} from '@/lib/graphql/generated/graphql';
import { EditTimeEntryDialog } from '@/components/time-clock/edit-time-entry-dialog';

type TimeEntry = NonNullable<NonNullable<TimeEntriesQuery['timeEntries']>[number]>;

function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatHoursMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function buildIso(date: string, time = '00:00'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function TimeEntriesTable(): React.JSX.Element {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [userId, setUserId] = useState<string>('');

  const filter = useMemo(() => {
    const f: { fromDate?: string; toDate?: string; userId?: string } = {};
    const fromIso = fromDate ? buildIso(fromDate, '00:00') : null;
    const toIso = toDate ? buildIso(toDate, '23:59') : null;
    if (fromIso) f.fromDate = fromIso;
    if (toIso) f.toDate = toIso;
    if (userId) f.userId = userId;
    return Object.keys(f).length > 0 ? f : null;
  }, [fromDate, toDate, userId]);

  const [{ data, fetching }, refetch] = useQuery({
    query: TimeEntriesDocument,
    variables: { filter },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: membersData }] = useQuery({
    query: AdminTenantMembersDocument,
    variables: { first: 100 },
  });

  const [editing, setEditing] = useState<TimeEntry | null>(null);

  const rows: TimeEntry[] = (data?.timeEntries ?? []).filter(
    (e): e is TimeEntry => e != null,
  );

  const userOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const edge of membersData?.tenantMembers?.edges ?? []) {
      const u = edge?.node?.user;
      if (!u?.id) continue;
      if (seen.has(u.id)) continue;
      seen.set(u.id, {
        id: u.id,
        label: u.name ?? u.email ?? u.id,
      });
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [membersData]);

  const columns: Column<TimeEntry>[] = [
    {
      key: 'user',
      header: 'Member',
      cell: (e) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {e.user?.name ?? e.user?.email ?? '—'}
          </span>
          {e.user?.name ? (
            <span className="text-xs text-muted-foreground">
              {e.user.email}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'in',
      header: 'In',
      cell: (e) => <span className="font-mono">{formatDateTime(e.clockedInAt)}</span>,
    },
    {
      key: 'out',
      header: 'Out',
      cell: (e) => (
        <span className="font-mono">
          {e.clockedOutAt ? formatDateTime(e.clockedOutAt) : '— open —'}
        </span>
      ),
    },
    {
      key: 'breaks',
      header: 'Breaks total',
      cell: (e) => `${e.totalBreakMinutes ?? 0} min`,
    },
    {
      key: 'net',
      header: 'Net',
      cell: (e) => (
        <span className="font-mono">
          {formatHoursMinutes(e.netMinutes ?? null)}
        </span>
      ),
    },
    {
      key: 'manual',
      header: '',
      cell: (e) =>
        e.manualEdit ? (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
            Edited
          </span>
        ) : null,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (e) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>
          Edit
        </Button>
      ),
    },
  ];

  const selectClassName = cn(
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="te-from">From</Label>
          <Input
            id="te-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="te-to">To</Label>
          <Input
            id="te-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="te-user">Member</Label>
          <select
            id="te-user"
            className={selectClassName}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">All members</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {fetching && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading time entries…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id ?? ''}
          emptyTitle="No time entries"
          emptyDescription="No entries match these filters."
        />
      )}

      <EditTimeEntryDialog
        entry={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch({ requestPolicy: 'network-only' });
        }}
      />
    </div>
  );
}
