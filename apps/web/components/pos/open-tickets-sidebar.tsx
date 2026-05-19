'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { EmptyState, formatMoney } from '@repo/ui';
import { ClipboardList } from 'lucide-react';
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

function elapsedMinutes(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}m`;
  } catch {
    return '';
  }
}

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

  const activeCount = tickets.length;

  return (
    <aside className="flex h-full w-[280px] flex-col border-r border-outline-variant bg-surface-container-low">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
        <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Open tickets
        </h2>
        <span className="rounded-full bg-secondary-container px-2 py-0.5 font-status-pill text-[10px] font-bold uppercase text-secondary-on-container">
          {activeCount} active
        </span>
      </div>
      <div className="border-b border-outline-variant px-3 py-3">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-bold text-on-primary shadow-card-soft transition-all hover:opacity-90 active:scale-[0.98]"
        >
          <span aria-hidden className="material-symbols-outlined text-[18px]">
            add
          </span>
          New ticket
        </button>
      </div>
      {error ? (
        <p className="px-3 py-2 text-body-staff text-error" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="flex-1 overflow-y-auto p-3">
        {fetching && tickets.length === 0 ? (
          <p className="text-body-staff text-on-surface-variant">Loading…</p>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No open tickets"
            description="Start by opening one."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {tickets.map((t) => {
              const isActive = activeTicketId === t.id;
              const lineCount =
                t.items?.filter((i) => i?.status !== 'VOIDED').length ?? 0;
              const isDineIn = t.orderType === OrderType.DineIn;
              const isTakeout = t.orderType === OrderType.Takeout;
              const hasLabel = Boolean(t.customerLabel);
              // Kiosk-paid orders surface a "Paid" pill so the cashier
              // can spot them in the queue without opening the ticket
              // — same signal as the active-panel header. Detection is
              // on the OnlineOrderRequest set CAPTURED by the terminal
              // callback when the customer swiped.
              const isPrepaid =
                t.onlineRequest?.paymentMode === 'PAY_AT_KIOSK' &&
                t.onlineRequest?.paymentStatus === 'CAPTURED';
              return (
                <li key={t.id ?? ''}>
                  <button
                    type="button"
                    onClick={() => t.id && onSelectTicket(t.id)}
                    aria-pressed={isActive}
                    className={[
                      'group relative flex w-full flex-col gap-2 overflow-hidden rounded-xl bg-surface-container-lowest p-4 text-left shadow-sm transition-all',
                      isActive
                        ? 'border-l-4 border-primary ring-1 ring-primary/10'
                        : 'border border-outline-variant hover:border-primary/50',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={[
                            'text-body-customer font-bold tabular-nums',
                            isActive ? 'text-primary' : 'text-on-surface',
                          ].join(' ')}
                        >
                          #{t.shortNumber ?? '—'}
                        </span>
                        <span
                          className={[
                            'text-body-staff font-medium',
                            hasLabel
                              ? 'text-on-surface'
                              : 'italic text-on-surface-variant',
                          ].join(' ')}
                        >
                          {t.customerLabel ?? 'No label'}
                        </span>
                      </div>
                      <span className="text-body-customer font-bold tabular-nums text-on-surface">
                        {formatMoney(t.totalCents ?? 0, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
                      <span>
                        {lineCount} {lineCount === 1 ? 'item' : 'items'}
                      </span>
                      <span
                        className={[
                          'tabular-nums',
                          isActive ? 'text-primary' : 'text-on-surface-variant',
                        ].join(' ')}
                      >
                        {elapsedMinutes(t.openedAt) || formatOpenedAt(t.openedAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 font-status-pill text-[10px] font-bold uppercase tracking-wider',
                          isDineIn
                            ? 'bg-secondary-container text-secondary-on-container'
                            : isTakeout
                              ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant'
                              : 'bg-surface-container-high text-on-surface-variant',
                        ].join(' ')}
                      >
                        {t.orderType ? ORDER_TYPE_LABEL[t.orderType] : '—'}
                      </span>
                      {isPrepaid ? (
                        <span
                          data-testid="open-ticket-prepaid-badge"
                          className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-status-pill text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
                        >
                          Paid
                        </span>
                      ) : null}
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
