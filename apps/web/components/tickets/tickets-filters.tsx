'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { TicketStatus } from '@/lib/graphql/generated/graphql';

export interface ServerOption {
  id: string;
  name: string;
}

export interface TicketsFilterValues {
  /** ISO date (YYYY-MM-DD) — local-day boundary, sent to api as start of day. */
  fromDate: string;
  /** ISO date (YYYY-MM-DD) — local-day boundary, sent to api as end of day. */
  toDate: string;
  /** "ALL" sentinel maps to undefined; otherwise a TicketStatus value. */
  status: 'ALL' | TicketStatus;
  /** "ALL" sentinel maps to undefined; otherwise a server (membership user) id. */
  serverId: 'ALL' | string;
}

interface TicketsFiltersProps {
  servers: ServerOption[];
  initialValues: TicketsFilterValues;
}

/**
 * Default filters: today, all statuses, all servers. The defaults are also
 * derived for the URL-less initial render so that the very first query
 * scopes to today's history rather than dumping every ticket ever closed.
 */
export function defaultFilterValues(now = new Date()): TicketsFilterValues {
  const iso = now.toISOString().slice(0, 10);
  return { fromDate: iso, toDate: iso, status: 'ALL', serverId: 'ALL' };
}

/**
 * Filter inputs for the tickets history table. State lives locally; "Apply
 * filters" pushes a new URL with the picked values as search params. The
 * parent table reads the same URL params to drive its query, so the filters
 * are bookmark-able and preserved across reloads.
 */
export function TicketsFilters({
  servers,
  initialValues,
}: TicketsFiltersProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [values, setValues] = useState<TicketsFilterValues>(initialValues);

  // Re-sync from URL when the user navigates back/forward.
  useEffect(() => {
    setValues(initialValues);
    // initialValues is a stable derivation of the URL; resyncing on it is
    // exactly what we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues.fromDate, initialValues.toDate, initialValues.status, initialValues.serverId]);

  const apply = (): void => {
    const params = new URLSearchParams(search?.toString() ?? '');
    params.set('from', values.fromDate);
    params.set('to', values.toDate);
    if (values.status === 'ALL') params.delete('status');
    else params.set('status', values.status);
    if (values.serverId === 'ALL') params.delete('serverId');
    else params.set('serverId', values.serverId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? '/'));
  };

  const reset = (): void => {
    const fresh = defaultFilterValues();
    setValues(fresh);
    router.replace(pathname ?? '/');
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-surface p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-from">From</Label>
        <Input
          id="filter-from"
          type="date"
          value={values.fromDate}
          onChange={(e) => setValues({ ...values, fromDate: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-to">To</Label>
        <Input
          id="filter-to"
          type="date"
          value={values.toDate}
          onChange={(e) => setValues({ ...values, toDate: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Status</Label>
        <Select
          value={values.status}
          onValueChange={(v) =>
            setValues({ ...values, status: v as TicketsFilterValues['status'] })
          }
        >
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value={TicketStatus.Open}>Open</SelectItem>
            <SelectItem value={TicketStatus.Closed}>Closed</SelectItem>
            <SelectItem value={TicketStatus.Voided}>Voided</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Server</Label>
        <Select
          value={values.serverId}
          onValueChange={(v) => setValues({ ...values, serverId: v })}
        >
          <SelectTrigger className="w-56" aria-label="Server">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All servers</SelectItem>
            {servers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name || '—'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={reset}>
          Reset
        </Button>
        <Button type="button" onClick={apply}>
          Apply filters
        </Button>
      </div>
    </div>
  );
}
