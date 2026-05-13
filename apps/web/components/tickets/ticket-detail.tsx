'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  formatMoney,
} from '@repo/ui';
import { toast } from 'sonner';
import {
  DiscountKind,
  OrderType,
  ReopenTicketDocument,
  TicketDocument,
  TicketItemStatus,
  TicketStatus,
  type TicketQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { TotalsBlock } from '@/components/pos/totals-block';
import { RefundTicketDialog } from './refund-ticket-dialog';

type Ticket = NonNullable<TicketQuery['ticket']>;
type Line = NonNullable<NonNullable<Ticket['items']>[number]>;
type TicketDiscount = NonNullable<NonNullable<Ticket['discounts']>[number]>;

interface TicketDetailProps {
  ticketId: string;
  /**
   * Whether the viewer can run manager-only mutations (`reopenTicket`).
   * Server enforces it too — we hide the button to avoid surfacing a
   * Forbidden toast to staff who can never use it.
   */
  canManagerActions: boolean;
}

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  [OrderType.DineIn]: 'Dine-in',
  [OrderType.Takeout]: 'Takeout',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  [TicketStatus.Open]: 'Open',
  [TicketStatus.Closed]: 'Closed',
  [TicketStatus.Voided]: 'Voided',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function describeDiscount(d: TicketDiscount, currency: string): string {
  if (d.kind === DiscountKind.Flat) return formatMoney(d.amountCents ?? 0, currency);
  if (d.kind === DiscountKind.Percent) {
    const bp = d.percentBp ?? 0;
    return `${(bp / 100).toFixed(2)}%`;
  }
  return '—';
}

function StatusPill({ status }: { status: TicketStatus | null | undefined }): React.JSX.Element {
  const cls = (() => {
    switch (status) {
      case TicketStatus.Open:
        return 'bg-emerald-100 text-emerald-800';
      case TicketStatus.Closed:
        return 'bg-secondary text-secondary-foreground';
      case TicketStatus.Voided:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  })();
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status ? STATUS_LABEL[status] : '—'}
    </span>
  );
}

function LineItemStatusPill({
  status,
}: {
  status: TicketItemStatus | null | undefined;
}): React.JSX.Element {
  const cls = (() => {
    switch (status) {
      case TicketItemStatus.New:
        return 'bg-muted text-muted-foreground';
      case TicketItemStatus.Fired:
        return 'bg-amber-100 text-amber-900';
      case TicketItemStatus.Ready:
        return 'bg-emerald-100 text-emerald-900';
      case TicketItemStatus.Served:
        return 'bg-secondary text-secondary-foreground';
      case TicketItemStatus.Voided:
        return 'bg-red-100 text-red-900';
      default:
        return 'bg-muted text-muted-foreground';
    }
  })();
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status ?? '—'}
    </span>
  );
}

/**
 * Read-only ticket detail viewed from `tickets/[id]`. Renders the header,
 * full line breakdown, discounts, totals, and an optional "Reopen" CTA for
 * managers when the ticket is `CLOSED`. All edits happen on the POS
 * surface — no inline mutation buttons here besides reopen.
 */
export function TicketDetail({
  ticketId,
  canManagerActions,
}: TicketDetailProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }, refetch] = useQuery({
    query: TicketDocument,
    variables: { id: ticketId },
    requestPolicy: 'cache-and-network',
  });
  const [, reopen] = useMutation(ReopenTicketDocument);
  const [refundOpen, setRefundOpen] = useState(false);

  const ticket = data?.ticket ?? null;

  if (fetching && !ticket) {
    return <p className="text-sm text-muted-foreground">Loading ticket…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    );
  }
  if (!ticket) {
    return <p className="text-sm text-muted-foreground">Ticket not found.</p>;
  }

  const items: Line[] = (ticket.items ?? []).filter((i): i is Line => Boolean(i?.id));
  const discounts: TicketDiscount[] = (ticket.discounts ?? []).filter(
    (d): d is TicketDiscount => Boolean(d?.id),
  );
  const ticketLevelDiscounts = discounts.filter(
    (d) => d.scope?.__typename === 'TicketScope',
  );

  const onReopen = async (): Promise<void> => {
    const result = await reopen({ input: { ticketId } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Ticket reopened');
    refetch({ requestPolicy: 'network-only' });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-3 text-2xl">
              <span>#{ticket.shortNumber ?? '—'}</span>
              <StatusPill status={ticket.status} />
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {ticket.customerLabel ?? 'No label'} ·{' '}
              {ticket.orderType ? ORDER_TYPE_LABEL[ticket.orderType] : '—'} · Server{' '}
              {ticket.openedBy?.name ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Opened {formatDateTime(ticket.openedAt)}
              {ticket.closedAt ? ` · Closed ${formatDateTime(ticket.closedAt)}` : ''}
              {ticket.voidedAt ? ` · Voided ${formatDateTime(ticket.voidedAt)}` : ''}
            </p>
          </div>
          {ticket.status === TicketStatus.Closed && canManagerActions ? (
            <div className="flex items-center gap-2">
              {(ticket.totalCents ?? 0) + (ticket.tipCents ?? 0) >
              (ticket.refundCents ?? 0) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRefundOpen(true)}
                  data-testid="ticket-refund-button"
                >
                  Refund
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={onReopen}>
                Reopen ticket
              </Button>
            </div>
          ) : null}
        </CardHeader>
        {ticket.closeNote ? (
          <CardContent>
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Close note
              </p>
              <p className="mt-1 whitespace-pre-wrap">{ticket.closeNote}</p>
            </div>
          </CardContent>
        ) : null}
        {ticket.voidReason ? (
          <CardContent>
            <div className="rounded-md border bg-destructive/10 p-3 text-sm text-destructive">
              <p className="text-xs font-semibold uppercase tracking-wide">Void reason</p>
              <p className="mt-1">{ticket.voidReason}</p>
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lines on this ticket.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {items.map((line) => (
                <li key={line.id ?? ''} className="flex flex-col gap-1 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex flex-1 items-baseline gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        ×{line.quantity ?? 1}
                      </span>
                      <span className="text-sm font-medium">{line.nameSnapshot ?? '—'}</span>
                      <LineItemStatusPill status={line.status} />
                    </div>
                    <span className="text-sm tabular-nums">
                      {formatMoney(line.lineSubtotalCents ?? 0, currency)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {formatMoney(line.unitPriceCents ?? 0, currency)} ×{' '}
                      {line.quantity ?? 1}
                      {line.modifiersTotalCents
                        ? ` + ${formatMoney(line.modifiersTotalCents, currency)} mods`
                        : ''}
                    </span>
                  </div>
                  {(line.modifiers ?? []).length > 0 ? (
                    <ul className="text-xs text-muted-foreground">
                      {(line.modifiers ?? [])
                        .filter((m) => m && m.nameSnapshot)
                        .map((m) => (
                          <li key={m?.id ?? ''}>
                            · {m?.nameSnapshot ?? ''}
                            {m?.priceDeltaCents
                              ? ` (${formatMoney(m.priceDeltaCents, currency)})`
                              : ''}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {(line.discounts ?? []).filter((d) => d && !d.voidedAt).length > 0 ? (
                    <ul className="text-xs text-emerald-700">
                      {(line.discounts ?? [])
                        .filter((d) => d && !d.voidedAt)
                        .map((d) => (
                          <li key={d?.id ?? ''}>
                            – {formatMoney(d?.computedCents ?? 0, currency)} ·{' '}
                            {d?.reason ?? ''}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {line.voidedAt ? (
                    <p className="text-xs text-destructive">
                      Voided · {line.voidReason ?? 'no reason'}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ticketLevelDiscounts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ticket discounts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {ticketLevelDiscounts.map((d) => (
                <li key={d.id ?? ''} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span>
                      {d.kind ?? '—'} · {describeDiscount(d, currency)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {d.reason ?? ''} · by {d.appliedBy?.name ?? '—'} ·{' '}
                      {formatDateTime(d.appliedAt)}
                      {d.voidedAt ? ` · voided ${formatDateTime(d.voidedAt)}` : ''}
                    </span>
                  </div>
                  <span className="tabular-nums text-sm">
                    -{formatMoney(d.computedCents ?? 0, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <TotalsBlock
          subtotalCents={ticket.subtotalCents ?? 0}
          discountCents={ticket.discountCents ?? 0}
          taxCents={ticket.taxCents ?? 0}
          totalCents={ticket.totalCents ?? 0}
        />
        {(ticket.tipCents ?? 0) > 0 || (ticket.refundCents ?? 0) > 0 ? (
          <CardContent className="border-t pt-3">
            <dl className="flex flex-col gap-1 text-sm" data-testid="ticket-tip-refund">
              {(ticket.tipCents ?? 0) > 0 ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Tip</dt>
                  <dd className="tabular-nums">
                    {formatMoney(ticket.tipCents ?? 0, currency)}
                  </dd>
                </div>
              ) : null}
              {(ticket.refundCents ?? 0) > 0 ? (
                <div className="flex items-center justify-between text-rose-700">
                  <dt>Refunded</dt>
                  <dd className="tabular-nums">
                    -{formatMoney(ticket.refundCents ?? 0, currency)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t pt-1 font-semibold">
                <dt>Net to customer</dt>
                <dd className="tabular-nums">
                  {formatMoney(
                    (ticket.totalCents ?? 0) +
                      (ticket.tipCents ?? 0) -
                      (ticket.refundCents ?? 0),
                    currency,
                  )}
                </dd>
              </div>
            </dl>
            {ticket.refundReason ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Refund reason: {ticket.refundReason}
              </p>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      <RefundTicketDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        ticketId={ticketId}
        ticketLabel={`#${ticket.shortNumber ?? '—'}`}
        refundableCents={(ticket.totalCents ?? 0) + (ticket.tipCents ?? 0)}
        alreadyRefundedCents={ticket.refundCents ?? 0}
        onRefunded={() => {
          setRefundOpen(false);
          refetch({ requestPolicy: 'network-only' });
        }}
      />
    </div>
  );
}
