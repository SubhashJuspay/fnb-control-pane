'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import {
  FloorTablesDocument,
  SeatReservationDocument,
  type FloorTablesQuery,
  type TableState,
} from '@/lib/graphql/generated/graphql';

interface SeatDialogProps {
  open: boolean;
  reservationId: string;
  partySize: number;
  onClose: () => void;
  onSeated: (ticketId: string) => void;
}

type FloorTableNode = NonNullable<NonNullable<FloorTablesQuery['floorTables']>[number]>;

/**
 * Pick a table and seat a reservation/walk-in. AVAILABLE tables matching
 * the party's capacity are listed first; OCCUPIED/RESERVED/CLEANING are
 * dimmed and disabled. Re-used by both the reservations book and the
 * waitlist surfaces.
 */
export function SeatDialog({
  open,
  reservationId,
  partySize,
  onClose,
  onSeated,
}: SeatDialogProps): React.JSX.Element {
  const [{ data, fetching }] = useQuery({
    query: FloorTablesDocument,
    pause: !open,
    requestPolicy: 'cache-and-network',
  });
  const [, seatReservation] = useMutation(SeatReservationDocument);
  const [busy, setBusy] = useState(false);
  const [pickedTableId, setPickedTableId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const all = (data?.floorTables ?? []).filter(
      (t): t is FloorTableNode => t !== null,
    );
    const matching = all.filter((t) => (t.capacity ?? 0) >= partySize);
    // AVAILABLE first, then RESERVED, then OCCUPIED/CLEANING last.
    const order: TableState[] = [
      'AVAILABLE' as TableState,
      'RESERVED' as TableState,
      'OCCUPIED' as TableState,
      'CLEANING' as TableState,
    ];
    return matching.sort((a, b) => {
      const ai = order.indexOf((a.state ?? 'AVAILABLE') as TableState);
      const bi = order.indexOf((b.state ?? 'AVAILABLE') as TableState);
      if (ai !== bi) return ai - bi;
      return (a.label ?? '').localeCompare(b.label ?? '');
    });
  }, [data?.floorTables, partySize]);

  const handleSubmit = async () => {
    if (!pickedTableId) return;
    setBusy(true);
    try {
      const result = await seatReservation({
        input: { reservationId, tableId: pickedTableId },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      const ticketId = result.data?.seatReservation?.ticket?.id;
      if (ticketId) onSeated(ticketId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seat reservation</DialogTitle>
          <DialogDescription>
            Pick a table that fits a party of {partySize}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {fetching ? (
            <p className="text-xs text-muted-foreground">Loading tables…</p>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No tables match this party size.
            </p>
          ) : (
            candidates.map((t) => {
              const id = t.id ?? '';
              const state = (t.state ?? 'AVAILABLE') as TableState;
              const disabled = state !== 'AVAILABLE';
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  data-table-pick={id}
                  onClick={() => setPickedTableId(id)}
                  className={`flex items-center justify-between rounded-md border px-2 py-1 text-left text-xs ${
                    pickedTableId === id ? 'border-primary bg-primary/10' : 'bg-background'
                  } ${disabled ? 'opacity-50' : 'hover:bg-muted'}`}
                >
                  <span>
                    {t.label} · {t.capacity}-top
                  </span>
                  <span className="text-muted-foreground">{state}</span>
                </button>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || !pickedTableId}
            data-action="seat"
          >
            Seat at table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
