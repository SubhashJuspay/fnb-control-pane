'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useSubscription } from 'urql';
import { toast } from 'sonner';
import { Button, DataTable, type Column } from '@repo/ui';
import {
  CancelReservationDocument,
  ConfirmReservationDocument,
  FloorUpdatesDocument,
  MarkReservationNoShowDocument,
  ReservationsForDayDocument,
  type ReservationsForDayQuery,
  type ReservationStatus,
} from '@/lib/graphql/generated/graphql';
import { NewReservationDialog } from './new-reservation-dialog';
import { SeatDialog } from './seat-dialog';

type ReservationRow = NonNullable<
  NonNullable<ReservationsForDayQuery['reservationsForDay']>[number]
>;

interface ReservationsPageProps {
  tenantSlug: string;
  locationSlug: string;
  locationName: string;
  canManagerActions: boolean;
}

const STATUS_PILL: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-blue-100 text-blue-900',
  WAITING: 'bg-amber-100 text-amber-900',
  SEATED: 'bg-emerald-100 text-emerald-900',
  COMPLETED: 'bg-gray-100 text-gray-700',
  NO_SHOW: 'bg-red-100 text-red-900',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function ReservationsPage({
  tenantSlug,
  locationSlug,
  locationName,
  canManagerActions,
}: ReservationsPageProps): React.JSX.Element {
  const [date, setDate] = useState<string>(todayString());
  const [newOpen, setNewOpen] = useState(false);
  const [seatingReservation, setSeatingReservation] = useState<{
    id: string;
    partySize: number;
  } | null>(null);

  // ReservationsForDay expects DateTime — pass midnight ISO of the chosen day.
  const dateIso = useMemo(
    () => new Date(`${date}T12:00:00`).toISOString(),
    [date],
  );

  const [{ data, fetching }, refetch] = useQuery({
    query: ReservationsForDayDocument,
    variables: { date: dateIso },
    requestPolicy: 'cache-and-network',
  });

  useSubscription({ query: FloorUpdatesDocument }, () => {
    refetch({ requestPolicy: 'network-only' });
    return null;
  });

  const [, confirmReservation] = useMutation(ConfirmReservationDocument);
  const [, cancelReservation] = useMutation(CancelReservationDocument);
  const [, markNoShow] = useMutation(MarkReservationNoShowDocument);

  const refresh = useCallback(() => {
    refetch({ requestPolicy: 'network-only' });
  }, [refetch]);

  const rows: ReservationRow[] = useMemo(
    () =>
      (data?.reservationsForDay ?? []).filter(
        (r): r is ReservationRow => r !== null,
      ),
    [data?.reservationsForDay],
  );

  const handleConfirm = async (id: string) => {
    const r = await confirmReservation({ input: { id } });
    if (r.error) {
      toast.error(r.error.message);
    } else {
      refresh();
    }
  };

  const handleCancel = async (id: string) => {
    const r = await cancelReservation({ input: { id, cancelReason: null } });
    if (r.error) {
      toast.error(r.error.message);
    } else {
      refresh();
    }
  };

  const handleNoShow = async (id: string) => {
    const r = await markNoShow({ input: { id } });
    if (r.error) {
      toast.error(r.error.message);
    } else {
      refresh();
    }
  };

  const columns: Column<ReservationRow>[] = useMemo(
    () => [
      {
        key: 'time',
        header: 'Time',
        cell: (row) =>
          row.requestedTime
            ? new Date(row.requestedTime as string).toLocaleTimeString(
                undefined,
                { hour: 'numeric', minute: '2-digit' },
              )
            : '—',
      },
      {
        key: 'guest',
        header: 'Guest',
        cell: (row) => row.guestName ?? '—',
      },
      {
        key: 'party',
        header: 'Party',
        cell: (row) => row.partySize ?? '—',
      },
      {
        key: 'status',
        header: 'Status',
        cell: (row) => {
          const status = row.status ?? 'PENDING';
          const cls = STATUS_PILL[status] ?? 'bg-gray-100 text-gray-700';
          return (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
              data-status={status}
            >
              {status}
            </span>
          );
        },
      },
      {
        key: 'table',
        header: 'Table',
        cell: (row) => row.table?.label ?? '—',
      },
      {
        key: 'actions',
        header: '',
        className: 'text-right',
        cell: (row) => {
          const id = row.id ?? '';
          const status = row.status as ReservationStatus | null | undefined;
          return (
            <div className="flex justify-end gap-1">
              {status === 'PENDING' && canManagerActions ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConfirm(id)}
                  data-action="confirm"
                >
                  Confirm
                </Button>
              ) : null}
              {(status === 'PENDING' || status === 'CONFIRMED') ? (
                <Button
                  size="sm"
                  onClick={() =>
                    setSeatingReservation({
                      id,
                      partySize: row.partySize ?? 2,
                    })
                  }
                  data-action="seat"
                >
                  Seat
                </Button>
              ) : null}
              {status === 'CONFIRMED' && canManagerActions ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNoShow(id)}
                  data-action="no-show"
                >
                  No-show
                </Button>
              ) : null}
              {(status === 'PENDING' ||
                status === 'CONFIRMED' ||
                status === 'WAITING') &&
              canManagerActions ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleCancel(id)}
                  data-action="cancel"
                >
                  Cancel
                </Button>
              ) : null}
              {status === 'SEATED' && row.ticket?.id ? (
                <Link
                  href={`/${tenantSlug}/${locationSlug}/pos?ticket=${row.ticket.id}`}
                >
                  <Button size="sm" variant="outline" data-action="open-ticket">
                    Open ticket
                  </Button>
                </Link>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManagerActions, tenantSlug, locationSlug], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">{locationName} · Reservations</h1>
          {fetching ? (
            <p className="text-xs text-muted-foreground">Refreshing…</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
            data-input="date"
          />
          <Link href={`/${tenantSlug}/${locationSlug}/waitlist`}>
            <Button variant="outline" size="sm">
              Waitlist
            </Button>
          </Link>
          {canManagerActions ? (
            <Button onClick={() => setNewOpen(true)} size="sm" data-action="new-reservation">
              New reservation
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <DataTable<ReservationRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id ?? ''}
          emptyTitle="No reservations on this day"
          emptyDescription={
            canManagerActions ? 'Click "New reservation" to add one.' : undefined
          }
        />
      </div>

      <NewReservationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          refresh();
        }}
      />

      {seatingReservation ? (
        <SeatDialog
          open
          reservationId={seatingReservation.id}
          partySize={seatingReservation.partySize}
          onClose={() => setSeatingReservation(null)}
          onSeated={(ticketId) => {
            setSeatingReservation(null);
            refresh();
            toast.success('Seated. Open in POS.', {
              action: {
                label: 'Open POS',
                onClick: () => {
                  window.location.href = `/${tenantSlug}/${locationSlug}/pos?ticket=${ticketId}`;
                },
              },
            });
          }}
        />
      ) : null}
    </div>
  );
}
