'use client';

import { useMemo } from 'react';
import { useQuery, useSubscription } from 'urql';
import { EmptyState } from '@repo/ui';
import { ChefHat } from 'lucide-react';
import {
  KitchenTicketsDocument,
  TicketItemStatus,
  TicketUpdatesDocument,
  type KitchenTicketsQuery,
} from '@/lib/graphql/generated/graphql';
import { KdsTicketCard } from './kds-ticket-card';

type KitchenTicket = NonNullable<NonNullable<KitchenTicketsQuery['kitchenTickets']>[number]>;

interface KdsBoardProps {
  locationName: string;
}

/**
 * Full-screen kitchen display. Subscribes to `TicketUpdates` over SSE; on
 * every event we re-fire the `kitchenTickets` query with `network-only` so
 * the visible cards reflect the latest item statuses. The server query
 * already restricts to tickets at the viewer's location with at least one
 * item in `FIRED` or `READY`; this component additionally hides cards
 * whose remaining items are all `SERVED`/`VOIDED` so a card disappears
 * the moment the last unready line is bumped and served.
 */
export function KdsBoard({ locationName }: KdsBoardProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: KitchenTicketsDocument,
    requestPolicy: 'cache-and-network',
  });

  // Fire-and-forget subscription — every event triggers a refetch of the
  // kitchen tickets query.
  useSubscription(
    { query: TicketUpdatesDocument },
    (_prev, payload) => {
      refetch({ requestPolicy: 'network-only' });
      return payload;
    },
  );

  const tickets: KitchenTicket[] = useMemo(() => {
    const all = (data?.kitchenTickets ?? []).filter(
      (t): t is KitchenTicket => Boolean(t?.id),
    );
    // Hide cards whose every visible item has been served or voided. The
    // server-side query already excludes tickets that have no FIRED/READY
    // items, but the next refetch is what removes them — until that
    // arrives we filter client-side too so the card disappears as soon as
    // its last bump completes.
    return all.filter((ticket) =>
      (ticket.items ?? []).some(
        (i) =>
          i?.status &&
          i.status !== TicketItemStatus.Served &&
          i.status !== TicketItemStatus.Voided,
      ),
    );
  }, [data]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">KDS · {locationName}</h1>
          <span className="text-sm text-muted-foreground tabular-nums">
            {tickets.length} active
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live
        </div>
      </header>
      {error ? (
        <p className="px-4 py-2 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="flex-1 overflow-y-auto p-4">
        {tickets.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={ChefHat}
              title="All clear."
              description="No active tickets."
              className="border-0"
            />
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {tickets.map((ticket) => (
              <KdsTicketCard key={ticket.id ?? ''} ticket={ticket} />
            ))}
          </div>
        )}
        {fetching && tickets.length === 0 ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}
