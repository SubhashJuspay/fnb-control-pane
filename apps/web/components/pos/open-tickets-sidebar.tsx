'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { Button, EmptyState, formatMoney } from '@repo/ui';
import { ClipboardList, Plus } from 'lucide-react';
import {
  OpenTicketsDocument,
  OrderType,
  type OpenTicketsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { NewTicketDialog } from './new-ticket-dialog';

type Ticket = NonNullable<NonNullable<OpenTicketsQuery['openTickets']>[number]>;

interface OpenTicketsSidebarProps {
  activeTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
}

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  [OrderType.DineIn]: 'Dine-in',
  [OrderType.Takeout]: 'Takeout',
};

function formatOpenedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Left rail of the POS workspace. Lists every open ticket at the current
 * location and lets staff flip between them by setting `?ticket=<id>` in the
 * URL. Refetches whenever the parent workspace receives a `TicketUpdates`
 * subscription event.
 */
export function OpenTicketsSidebar({
  activeTicketId,
  onSelectTicket,
}: OpenTicketsSidebarProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }] = useQuery({ query: OpenTicketsDocument });
  const [dialogOpen, setDialogOpen] = useState(false);

  const tickets: Ticket[] = useMemo(
    () => (data?.openTickets ?? []).filter((t): t is Ticket => Boolean(t?.id)),
    [data],
  );

  const onTicketCreated = (ticketId: string): void => {
    setDialogOpen(false);
    onSelectTicket(ticketId);
  };

  return (
    <aside className="flex h-full w-72 flex-col border-r bg-surface">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Open tickets
        </h2>
        <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          New ticket
        </Button>
      </div>
      {error ? (
        <p className="px-3 py-2 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="flex-1 overflow-y-auto">
        {fetching && tickets.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Loading…</p>
        ) : tickets.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={ClipboardList}
              title="No open tickets"
              description="Start by opening one."
            />
          </div>
        ) : (
          <ul className="flex flex-col">
            {tickets.map((t) => {
              const isActive = activeTicketId === t.id;
              const lineCount = t.items?.filter((i) => i?.status !== 'VOIDED').length ?? 0;
              return (
                <li key={t.id ?? ''}>
                  <button
                    type="button"
                    onClick={() => t.id && onSelectTicket(t.id)}
                    aria-pressed={isActive}
                    className={[
                      'flex w-full flex-col gap-1 border-b px-3 py-2 text-left transition-colors',
                      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">#{t.shortNumber ?? '—'}</span>
                      <span className="text-sm tabular-nums">
                        {formatMoney(t.totalCents ?? 0, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">
                        {t.customerLabel ?? 'No label'}
                      </span>
                      <span className="text-muted-foreground">{formatOpenedAt(t.openedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                        {t.orderType ? ORDER_TYPE_LABEL[t.orderType] : '—'}
                      </span>
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium">
                        {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <NewTicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={onTicketCreated}
      />
    </aside>
  );
}
