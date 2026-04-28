'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@repo/ui';
import {
  OpenTicketAtTableDocument,
  SeatReservationDocument,
  SetTableManualStateDocument,
  TableManualState,
} from '@/lib/graphql/generated/graphql';

export interface LiveFloorTable {
  id: string;
  label: string;
  state: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  manualState: 'NONE' | 'CLEANING';
  activeTicketId: string | null;
  activeTicketShortNumber: number | null;
  upcomingReservationId: string | null;
  upcomingReservationGuestName: string | null;
  upcomingReservationPartySize: number | null;
  upcomingReservationRequestedTime: string | null;
}

export type TableActionResult =
  | { kind: 'opened-ticket'; ticketId: string }
  | { kind: 'seated'; ticketId: string }
  | { kind: 'closed' };

interface TableActionSheetProps {
  table: LiveFloorTable;
  tenantSlug: string;
  locationSlug: string;
  canManagerActions: boolean;
  onClose: () => void;
  onAfterAction: (result: TableActionResult) => void;
}

/**
 * Bottom-sheet of state-conditional actions for a clicked table on the live
 * floor view. Mutations (`openTicketAtTable`, `setTableManualState`,
 * `seatReservation`) fire from here and report back to the parent so the
 * underlying canvas can refetch.
 */
export function TableActionSheet({
  table,
  tenantSlug,
  locationSlug,
  canManagerActions,
  onClose,
  onAfterAction,
}: TableActionSheetProps): React.JSX.Element {
  const [, openTicketAtTable] = useMutation(OpenTicketAtTableDocument);
  const [, setTableManualState] = useMutation(SetTableManualStateDocument);
  const [, seatReservation] = useMutation(SeatReservationDocument);
  const [busy, setBusy] = useState(false);

  const handleOpenTicket = async () => {
    setBusy(true);
    try {
      const result = await openTicketAtTable({
        input: { tableId: table.id },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      const id = result.data?.openTicketAtTable?.id;
      if (id) onAfterAction({ kind: 'opened-ticket', ticketId: id });
    } finally {
      setBusy(false);
    }
  };

  const handleManualState = async (next: 'NONE' | 'CLEANING') => {
    setBusy(true);
    try {
      const enumValue =
        next === 'CLEANING' ? TableManualState.Cleaning : TableManualState.None;
      const result = await setTableManualState({
        input: { tableId: table.id, manualState: enumValue },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onAfterAction({ kind: 'closed' });
    } finally {
      setBusy(false);
    }
  };

  const handleSeatReservation = async () => {
    if (!table.upcomingReservationId) return;
    setBusy(true);
    try {
      const result = await seatReservation({
        input: {
          reservationId: table.upcomingReservationId,
          tableId: table.id,
        },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      const id = result.data?.seatReservation?.ticket?.id;
      if (id) onAfterAction({ kind: 'seated', ticketId: id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Table {table.label}</SheetTitle>
          <SheetDescription>
            State: <span data-table-state>{table.state}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 px-4 text-sm">
          {table.state === 'OCCUPIED' && table.activeTicketId ? (
            <p>
              Active ticket: #{table.activeTicketShortNumber ?? '—'}
            </p>
          ) : null}
          {table.state === 'RESERVED' && table.upcomingReservationId ? (
            <p>
              Upcoming: {table.upcomingReservationGuestName ?? 'Guest'} (party of{' '}
              {table.upcomingReservationPartySize ?? '—'})
            </p>
          ) : null}
        </div>

        <SheetFooter className="flex-col gap-2">
          {table.state === 'AVAILABLE' ? (
            <>
              <Button
                onClick={handleOpenTicket}
                disabled={busy}
                data-action="open-ticket"
              >
                Open ticket
              </Button>
              <Button
                variant="outline"
                onClick={() => handleManualState('CLEANING')}
                disabled={busy}
                data-action="mark-cleaning"
              >
                Mark cleaning
              </Button>
              {canManagerActions ? (
                <Link
                  href={`/${tenantSlug}/${locationSlug}/floor/edit?table=${table.id}`}
                >
                  <Button variant="ghost" className="w-full">
                    Edit table
                  </Button>
                </Link>
              ) : null}
            </>
          ) : null}

          {table.state === 'OCCUPIED' && table.activeTicketId ? (
            <Link
              href={`/${tenantSlug}/${locationSlug}/pos?ticket=${table.activeTicketId}`}
            >
              <Button className="w-full" data-action="open-in-pos">
                Open in POS
              </Button>
            </Link>
          ) : null}

          {table.state === 'RESERVED' && table.upcomingReservationId ? (
            <>
              <Button
                onClick={handleSeatReservation}
                disabled={busy}
                data-action="seat-now"
              >
                Seat now
              </Button>
              <Link
                href={`/${tenantSlug}/${locationSlug}/reservations`}
              >
                <Button variant="outline" className="w-full">
                  View reservation
                </Button>
              </Link>
            </>
          ) : null}

          {table.state === 'CLEANING' ? (
            <Button
              onClick={() => handleManualState('NONE')}
              disabled={busy}
              data-action="mark-available"
            >
              Mark available
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
