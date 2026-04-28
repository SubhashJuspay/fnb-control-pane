'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useSubscription } from 'urql';
import { Button, EmptyState, FloorCanvas, type FloorCanvasTable } from '@repo/ui';
import {
  FloorTablesDocument,
  FloorUpdatesDocument,
  type FloorTablesQuery,
  type TableState as GqlTableState,
  type TableShape as GqlTableShape,
  type TableManualState as GqlTableManualState,
} from '@/lib/graphql/generated/graphql';
import { TableActionSheet, type LiveFloorTable } from './table-action-sheet';

const STATE_LEGEND: Array<{ key: GqlTableState; label: string; className: string }> = [
  { key: 'AVAILABLE' as GqlTableState, label: 'Available', className: 'bg-emerald-100 text-emerald-900 border-emerald-500' },
  { key: 'OCCUPIED' as GqlTableState, label: 'Occupied', className: 'bg-red-100 text-red-900 border-red-500' },
  { key: 'RESERVED' as GqlTableState, label: 'Reserved', className: 'bg-amber-100 text-amber-900 border-amber-500' },
  { key: 'CLEANING' as GqlTableState, label: 'Cleaning', className: 'bg-gray-200 text-gray-700 border-gray-500' },
];

type FloorTableNode = NonNullable<NonNullable<FloorTablesQuery['floorTables']>[number]>;

interface LiveFloorProps {
  tenantSlug: string;
  locationSlug: string;
  locationName: string;
  canManagerActions: boolean;
  viewerId: string;
}

/**
 * Client-side live floor. Subscribes to `floorUpdates` and refetches
 * `FloorTablesQuery` on every event so the canvas, counts, and action sheet
 * stay in sync with other terminals.
 */
export function LiveFloor({
  tenantSlug,
  locationSlug,
  locationName,
  canManagerActions,
  viewerId,
}: LiveFloorProps): React.JSX.Element {
  const router = useRouter();
  const [{ data, fetching }, refetch] = useQuery({
    query: FloorTablesDocument,
    requestPolicy: 'cache-and-network',
  });
  // Subscribe; refetch on every event by re-firing the query.
  useSubscription({ query: FloorUpdatesDocument }, () => {
    refetch({ requestPolicy: 'network-only' });
    return null;
  });

  const [sectionFilter, setSectionFilter] = useState<string | 'ALL'>('ALL');
  const [myTablesOnly, setMyTablesOnly] = useState(false);
  const [openTableId, setOpenTableId] = useState<string | null>(null);

  const allTables: FloorTableNode[] = useMemo(
    () => (data?.floorTables ?? []).filter((t): t is FloorTableNode => t !== null),
    [data?.floorTables],
  );

  const filteredTables = useMemo(() => {
    return allTables.filter((t) => {
      if (sectionFilter !== 'ALL') {
        if ((t.section?.id ?? null) !== sectionFilter) return false;
      }
      if (myTablesOnly && t.assignedServer?.id !== viewerId) return false;
      return true;
    });
  }, [allTables, sectionFilter, myTablesOnly, viewerId]);

  const sectionsForFilter = useMemo(() => {
    const set = new Map<string, string>();
    for (const t of allTables) {
      if (t.section?.id && t.section?.name) set.set(t.section.id, t.section.name);
    }
    return [...set.entries()].map(([id, name]) => ({ id, name }));
  }, [allTables]);

  const counts = useMemo(() => {
    const tally: Record<GqlTableState, number> = {
      AVAILABLE: 0,
      OCCUPIED: 0,
      RESERVED: 0,
      CLEANING: 0,
    } as Record<GqlTableState, number>;
    for (const t of filteredTables) {
      const state = (t.state ?? 'AVAILABLE') as GqlTableState;
      tally[state] = (tally[state] ?? 0) + 1;
    }
    return tally;
  }, [filteredTables]);

  const canvasTables: FloorCanvasTable[] = useMemo(
    () =>
      filteredTables.map((t) => ({
        id: t.id ?? '',
        label: t.label ?? '',
        capacity: t.capacity ?? 2,
        shape: (t.shape ?? 'RECT') as GqlTableShape as 'RECT' | 'CIRCLE',
        positionX: t.positionX ?? 0,
        positionY: t.positionY ?? 0,
        width: t.width ?? 80,
        height: t.height ?? 80,
        rotation: t.rotation ?? 0,
        state: (t.state ?? 'AVAILABLE') as GqlTableState as
          | 'AVAILABLE'
          | 'OCCUPIED'
          | 'RESERVED'
          | 'CLEANING',
      })),
    [filteredTables],
  );

  const openTable: LiveFloorTable | null = useMemo(() => {
    if (!openTableId) return null;
    const t = allTables.find((tt) => tt.id === openTableId);
    if (!t) return null;
    return {
      id: t.id ?? '',
      label: t.label ?? '',
      state: (t.state ?? 'AVAILABLE') as 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING',
      manualState: (t.manualState ?? 'NONE') as GqlTableManualState as 'NONE' | 'CLEANING',
      activeTicketId: t.activeTicket?.id ?? null,
      activeTicketShortNumber: t.activeTicket?.shortNumber ?? null,
      upcomingReservationId: t.upcomingReservation?.id ?? null,
      upcomingReservationGuestName: t.upcomingReservation?.guestName ?? null,
      upcomingReservationPartySize: t.upcomingReservation?.partySize ?? null,
      upcomingReservationRequestedTime: t.upcomingReservation?.requestedTime ?? null,
    };
  }, [openTableId, allTables]);

  const onAfterAction = useCallback(
    (
      action:
        | { kind: 'opened-ticket'; ticketId: string }
        | { kind: 'closed' }
        | { kind: 'seated'; ticketId: string },
    ) => {
      setOpenTableId(null);
      refetch({ requestPolicy: 'network-only' });
      if (action.kind === 'opened-ticket' || action.kind === 'seated') {
        router.push(
          `/${tenantSlug}/${locationSlug}/pos?ticket=${action.ticketId}`,
        );
      }
    },
    [refetch, router, tenantSlug, locationSlug],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{locationName} · Floor</h1>
          {fetching ? (
            <span className="text-xs text-muted-foreground">Refreshing…</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <select
            data-section-filter
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value as string | 'ALL')}
          >
            <option value="ALL">All sections</option>
            {sectionsForFilter.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={myTablesOnly}
              onChange={(e) => setMyTablesOnly(e.target.checked)}
            />
            My tables
          </label>
          {canManagerActions ? (
            <Link
              href={`/${tenantSlug}/${locationSlug}/floor/edit`}
              className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
            >
              Edit floor
            </Link>
          ) : null}
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs">
        {STATE_LEGEND.map((s) => (
          <span
            key={s.key}
            className={`rounded-md border px-2 py-1 ${s.className}`}
            data-legend-state={s.key}
          >
            {s.label}: {counts[s.key] ?? 0}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filteredTables.length === 0 ? (
          <EmptyState
            title="No tables on this floor"
            description={
              canManagerActions
                ? 'Create sections and tables in the floor editor to get started.'
                : 'Ask a manager to create the floor plan.'
            }
            action={
              canManagerActions ? (
                <Link href={`/${tenantSlug}/${locationSlug}/floor/edit`}>
                  <Button>Open editor</Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <FloorCanvas
            tables={canvasTables}
            mode="view"
            onTableClick={setOpenTableId}
          />
        )}
      </div>

      {openTable ? (
        <TableActionSheet
          table={openTable}
          tenantSlug={tenantSlug}
          locationSlug={locationSlug}
          canManagerActions={canManagerActions}
          onClose={() => setOpenTableId(null)}
          onAfterAction={onAfterAction}
        />
      ) : null}
    </div>
  );
}

// Re-export selected default mutation to silence unused import warnings if any.
// (kept for symmetry with pos workspace — the action sheet imports them.)
export { useMutation };
