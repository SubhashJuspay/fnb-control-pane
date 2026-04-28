'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useSubscription } from 'urql';
import { toast } from 'sonner';
import { Button } from '@repo/ui';
import {
  CancelReservationDocument,
  FloorUpdatesDocument,
  WaitlistDocument,
  type WaitlistQuery,
} from '@/lib/graphql/generated/graphql';
import { AddWalkinForm } from './add-walkin-form';
import { SeatDialog } from './seat-dialog';

type WalkinRow = NonNullable<NonNullable<WaitlistQuery['waitlist']>[number]>;

interface WaitlistPageProps {
  tenantSlug: string;
  locationSlug: string;
  locationName: string;
}

function formatTimeSince(isoOrDate: string | Date | null | undefined, now: number): string {
  if (!isoOrDate) return '—';
  const t = typeof isoOrDate === 'string' ? new Date(isoOrDate).getTime() : isoOrDate.getTime();
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

export function WaitlistPage({
  tenantSlug,
  locationSlug,
  locationName,
}: WaitlistPageProps): React.JSX.Element {
  const [{ data, fetching }, refetch] = useQuery({
    query: WaitlistDocument,
    requestPolicy: 'cache-and-network',
  });
  useSubscription({ query: FloorUpdatesDocument }, () => {
    refetch({ requestPolicy: 'network-only' });
    return null;
  });
  const [, cancelReservation] = useMutation(CancelReservationDocument);

  const [seatingReservation, setSeatingReservation] = useState<{
    id: string;
    partySize: number;
  } | null>(null);

  // Tick a heartbeat every 30s so the time-since-added text re-renders.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    refetch({ requestPolicy: 'network-only' });
  }, [refetch]);

  const rows: WalkinRow[] = useMemo(
    () =>
      (data?.waitlist ?? []).filter((r): r is WalkinRow => r !== null),
    [data?.waitlist],
  );

  const handleCancel = async (id: string) => {
    const r = await cancelReservation({ input: { id, cancelReason: null } });
    if (r.error) toast.error(r.error.message);
    else refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">{locationName} · Waitlist</h1>
          {fetching ? (
            <p className="text-xs text-muted-foreground">Refreshing…</p>
          ) : null}
        </div>
        <Link href={`/${tenantSlug}/${locationSlug}/reservations`}>
          <Button variant="outline" size="sm">
            Reservations
          </Button>
        </Link>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        <AddWalkinForm onAdded={refresh} />

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No walk-ins waiting.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const id = r.id ?? '';
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                  data-walkin-row={id}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {r.guestName ?? '—'} · party of {r.partySize ?? '—'}
                    </span>
                    {r.notes ? (
                      <span className="text-xs text-muted-foreground">{r.notes}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span data-time-since>
                      Waiting {formatTimeSince(r.createdAt as string | null, now)}
                    </span>
                    <Button
                      size="sm"
                      onClick={() =>
                        setSeatingReservation({
                          id,
                          partySize: r.partySize ?? 2,
                        })
                      }
                      data-action="seat"
                    >
                      Seat
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleCancel(id)}
                      data-action="cancel"
                    >
                      Cancel
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
