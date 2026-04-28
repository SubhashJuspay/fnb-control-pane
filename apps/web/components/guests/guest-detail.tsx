'use client';

import Link from 'next/link';
import { useMutation, useQuery } from 'urql';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  DataTable,
  formatMoney,
  type Column,
} from '@repo/ui';
import { ArrowLeft } from 'lucide-react';
import {
  GuestDocument,
  UpdateGuestDocument,
  type GuestQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { GuestForm } from './guest-form';

type Guest = NonNullable<GuestQuery['guest']>;
type RecentTicket = NonNullable<NonNullable<Guest['recentTickets']>[number]>;
type Reservation = NonNullable<NonNullable<Guest['upcomingReservation']>[number]>;

interface GuestDetailProps {
  guestId: string;
  tenantSlug: string;
  locationSlug: string;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Per-guest profile page: editable form on the left, KPI summary + upcoming
 * reservation card + recent-tickets table on the right. The recent-tickets
 * row count exposes a `data-testid="recent-ticket-row"` per row so E2E
 * specs can assert on visit history without depending on render order of
 * cells.
 */
export function GuestDetail({
  guestId,
  tenantSlug,
  locationSlug,
}: GuestDetailProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }, refetch] = useQuery({
    query: GuestDocument,
    variables: { id: guestId },
  });
  const [{ fetching: saving }, updateGuest] = useMutation(UpdateGuestDocument);

  const guest = data?.guest ?? null;

  if (fetching && !guest) {
    return <p className="text-sm text-muted-foreground">Loading guest…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    );
  }
  if (!guest) {
    return (
      <p className="text-sm text-muted-foreground">Guest not found.</p>
    );
  }

  const ticketRows: RecentTicket[] = (guest.recentTickets ?? []).filter(
    (t): t is RecentTicket => t != null && Boolean(t.id),
  );
  const upcomingList: Reservation[] = (guest.upcomingReservation ?? []).filter(
    (r): r is Reservation => r != null,
  );
  const upcoming: Reservation | null = upcomingList[0] ?? null;

  const columns: Column<RecentTicket>[] = [
    {
      key: 'shortNumber',
      header: '#',
      className: 'tabular-nums',
      cell: (row) => `#${row.shortNumber ?? '—'}`,
    },
    {
      key: 'label',
      header: 'Label',
      cell: (row) => row.customerLabel ?? '—',
    },
    {
      key: 'closedAt',
      header: 'Closed',
      cell: (row) => formatDateTime(row.closedAt),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right tabular-nums',
      cell: (row) => formatMoney(row.totalCents ?? 0, currency),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/${tenantSlug}/${locationSlug}/guests`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Back to guests
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-base font-semibold">{guest.name}</h2>
            <GuestForm
              mode="update"
              guestId={guest.id ?? guestId}
              initial={{
                name: guest.name ?? '',
                phone: guest.phone ?? '',
                email: guest.email ?? '',
                notes: guest.notes ?? '',
              }}
              submitting={saving}
              onSubmit={async (values) => {
                const result = await updateGuest({ input: values });
                if (result.error) {
                  toast.error(result.error.message);
                  return;
                }
                toast.success('Saved');
                refetch({ requestPolicy: 'network-only' });
              }}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="grid grid-cols-3 gap-3 p-4 text-center">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Visits
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {guest.visitCount ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Total spent
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(guest.totalSpentCents ?? 0, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Avg ticket
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(guest.averageTicketCents ?? 0, currency)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold">Upcoming reservation</p>
              {upcoming ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Party of {upcoming.partySize ?? '—'} at{' '}
                  {formatDateTime(upcoming.requestedTime)}
                  {upcoming.table?.label ? ` (${upcoming.table.label})` : ''}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  None scheduled.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Recent tickets</h3>
        <DataTable
          rows={ticketRows}
          columns={columns}
          rowKey={(row) => row.id ?? ''}
          emptyTitle="No tickets yet"
          emptyDescription="Closed tickets linked to this guest will appear here."
        />
      </div>
    </div>
  );
}
