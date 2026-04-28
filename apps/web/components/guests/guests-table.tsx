'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'urql';
import {
  Button,
  DataTable,
  Input,
  formatMoney,
  type Column,
} from '@repo/ui';
import {
  GuestsDocument,
  type GuestsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { NewGuestDialog } from './new-guest-dialog';

type GuestRow = NonNullable<NonNullable<GuestsQuery['guests']>[number]>;

interface GuestsTableProps {
  tenantSlug: string;
  locationSlug: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Manager-scope guest list. The API returns guests for the tenant; visit /
 * spend metrics are scoped to the viewer's active location, so the same
 * row will display different totals when an admin switches locations.
 */
export function GuestsTable({
  tenantSlug,
  locationSlug,
}: GuestsTableProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const currency = useLocationCurrency();
  const trimmed = search.trim();

  const [{ data, fetching, error }, refetch] = useQuery({
    query: GuestsDocument,
    variables: { filter: trimmed.length > 0 ? { search: trimmed } : null },
  });

  const rows: GuestRow[] = (data?.guests ?? []).filter(
    (g): g is GuestRow => g != null && Boolean(g.id),
  );

  const columns: Column<GuestRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <Link
          href={`/${tenantSlug}/${locationSlug}/guests/${row.id ?? ''}`}
          className="font-medium hover:underline"
          data-testid={`guest-row-${row.id}`}
        >
          {row.name ?? '—'}
        </Link>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{row.phone ?? '—'}</span>
      ),
    },
    {
      key: 'lastSeen',
      header: 'Last seen',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.lastSeenAt)}
        </span>
      ),
    },
    {
      key: 'visitCount',
      header: 'Visits',
      className: 'text-right tabular-nums',
      cell: (row) => <span data-testid={`visits-${row.id}`}>{row.visitCount ?? 0}</span>,
    },
    {
      key: 'totalSpent',
      header: 'Total spent',
      className: 'text-right tabular-nums',
      cell: (row) => formatMoney(row.totalSpentCents ?? 0, currency),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="max-w-sm"
          aria-label="Search guests"
          data-input="search"
        />
        <Button
          type="button"
          onClick={() => setDialogOpen(true)}
          data-action="new-guest"
        >
          New guest
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id ?? ''}
        emptyTitle={
          fetching ? 'Loading guests…' : 'No guests yet'
        }
        emptyDescription={
          fetching
            ? undefined
            : trimmed.length > 0
              ? `No guests match "${trimmed}".`
              : 'Create your first guest to start tracking visits and spend.'
        }
      />
      <NewGuestDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false);
          refetch({ requestPolicy: 'network-only' });
        }}
      />
    </div>
  );
}
