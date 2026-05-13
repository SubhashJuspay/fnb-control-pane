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
          <ul className="flex flex-col gap-1 p-2">
            {tickets.map((t) => {
              const isActive = activeTicketId === t.id;
              const lineCount = t.items?.filter((i) => i?.status !== 'VOIDED').length ?? 0;
              const isDineIn = t.orderType === OrderType.DineIn;
              const isTakeout = t.orderType === OrderType.Takeout;
              const hasLabel = Boolean(t.customerLabel);
              return (
                <li key={t.id ?? ''}>
                  <button
                    type="button"
                    onClick={() => t.id && onSelectTicket(t.id)}
                    aria-pressed={isActive}
                    className={[
                      'group relative flex w-full flex-col gap-1.5 overflow-hidden rounded-lg border p-3 pl-4 text-left transition-all',
                      isActive
                        ? 'border-primary/40 bg-primary/10 shadow-sm'
                        : 'border-border bg-card hover:border-primary/30 hover:bg-muted/40',
                    ].join(' ')}
                  >
                    {/* Left accent bar — full height when active, fades in on hover otherwise. */}
                    <span
                      aria-hidden
                      className={[
                        'absolute inset-y-0 left-0 w-1 transition-opacity',
                        isActive ? 'bg-primary opacity-100' : 'bg-primary opacity-0 group-hover:opacity-40',
                      ].join(' ')}
                    />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-base font-bold tabular-nums">
                        #{t.shortNumber ?? '—'}
                      </span>
                      <span
                        className={[
                          'text-base font-semibold tabular-nums',
                          (t.totalCents ?? 0) > 0 ? 'text-foreground' : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        {formatMoney(t.totalCents ?? 0, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={[
                          'truncate font-medium',
                          hasLabel ? 'text-foreground' : 'italic text-muted-foreground',
                        ].join(' ')}
                      >
                        {t.customerLabel ?? 'No label'}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatOpenedAt(t.openedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={[
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          isDineIn
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200'
                            : isTakeout
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                              : 'bg-muted text-muted-foreground',
                        ].join(' ')}
                      >
                        {t.orderType ? ORDER_TYPE_LABEL[t.orderType] : '—'}
                      </span>
                      <span
                        className={[
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums',
                          lineCount === 0
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
                        ].join(' ')}
                      >
                        {lineCount} {lineCount === 1 ? 'item' : 'items'}
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
