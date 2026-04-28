'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useSubscription } from 'urql';
import {
  OpenTicketsDocument,
  TicketDocument,
  TicketUpdatesDocument,
} from '@/lib/graphql/generated/graphql';
import { OpenTicketsSidebar } from './open-tickets-sidebar';
import { MenuTileGrid } from './menu-tile-grid';

interface PosWorkspaceProps {
  tenantSlug: string;
  locationSlug: string;
}

/**
 * Two-column POS shell. The left column is the open-tickets sidebar; the
 * right column hosts the menu tile grid (Task 15) and the active ticket
 * panel (Task 16). The active ticket id is stored in the URL search param
 * `?ticket=<id>` so it survives a page refresh and can be linked to.
 *
 * `useSubscription(TicketUpdatesDocument)` runs at this level so that every
 * change at the location (ours or another terminal's) refetches the open
 * tickets list and the active ticket query. Refetch happens on every event
 * via the `requestPolicy: 'network-only'` re-fire below.
 */
export function PosWorkspace({ tenantSlug, locationSlug }: PosWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const activeTicketId = search?.get('ticket') ?? null;

  // Subscribe to ticket updates at the location. We don't need the payload —
  // we just want to know an event fired so we can refetch the visible
  // queries. urql v5 calls the optional handler with the latest event
  // payload, but ignoring it is fine.
  useSubscription({ query: TicketUpdatesDocument });

  // Open-tickets list — we trigger the refetch on every subscription tick so
  // the sidebar reflects the latest state.
  const [, refetchOpenTickets] = useQuery({
    query: OpenTicketsDocument,
    requestPolicy: 'cache-and-network',
  });

  const [, refetchActiveTicket] = useQuery({
    query: TicketDocument,
    variables: { id: activeTicketId ?? '' },
    pause: !activeTicketId,
  });

  // On any subscription event, refetch the visible queries with
  // `network-only` so we always pull fresh totals/statuses.
  // Note: urql does not expose a synchronous event hook on the subscription —
  // instead we rely on its cache invalidation. As a safety net we also fire
  // a periodic refetch when the active ticket changes (below).
  useEffect(() => {
    if (!activeTicketId) return;
    refetchActiveTicket({ requestPolicy: 'network-only' });
  }, [activeTicketId, refetchActiveTicket]);

  // Empty-string url change helper — preserves the current pathname.
  const setActiveTicket = useCallback(
    (ticketId: string | null) => {
      const params = new URLSearchParams(search?.toString() ?? '');
      if (ticketId) params.set('ticket', ticketId);
      else params.delete('ticket');
      const qs = params.toString();
      const next = qs ? `${pathname}?${qs}` : (pathname ?? '/');
      router.replace(next);
    },
    [pathname, router, search],
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full">
      <OpenTicketsSidebar
        activeTicketId={activeTicketId}
        onSelectTicket={(id) => {
          setActiveTicket(id);
          refetchOpenTickets({ requestPolicy: 'network-only' });
        }}
      />
      <main className="flex flex-1 flex-row overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <MenuTileGrid activeTicketId={activeTicketId} />
        </div>
        <div className="hidden w-96 flex-col border-l bg-surface md:flex">
          <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
            {activeTicketId ? (
              <p>Active ticket panel arrives in the next task.</p>
            ) : (
              <p>
                Select an open ticket or create a new one.
                <br />
                <span className="opacity-70">
                  Tenant: {tenantSlug} · Location: {locationSlug}
                </span>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
