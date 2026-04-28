'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@repo/ui';
import { ChevronDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  FireTicketDocument,
  LinkTicketGuestDocument,
  OrderType,
  ReopenTicketDocument,
  TicketDocument,
  TicketItemStatus,
  TicketStatus,
  UpdateTicketLabelDocument,
  UpdateTicketOrderTypeDocument,
  type TicketQuery,
} from '@/lib/graphql/generated/graphql';
import { GuestPicker } from '@/components/guests/guest-picker';
import { CloseTicketDialog } from './close-ticket-dialog';
import { DiscountDialog } from './discount-dialog';
import { LineRow } from './line-row';
import { ModifierPicker } from './modifier-picker';
import { TotalsBlock } from './totals-block';
import { VoidLineDialog } from './void-line-dialog';
import { VoidTicketDialog } from './void-ticket-dialog';

type Ticket = NonNullable<TicketQuery['ticket']>;
type Line = NonNullable<NonNullable<Ticket['items']>[number]>;

interface ActiveTicketPanelProps {
  ticketId: string;
  /** Lets the parent know we just transitioned the ticket out of OPEN. */
  onTicketClosed?: () => void;
  /**
   * Whether the viewer can reopen tickets. Server enforces manager scope on
   * `reopenTicket`; we hide the button if the membership is staff-only so it
   * doesn't surface a Forbidden toast for every staff click.
   */
  canManagerActions: boolean;
}

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  [OrderType.DineIn]: 'Dine-in',
  [OrderType.Takeout]: 'Takeout',
};

/**
 * Returns true when every non-voided ticket item is SERVED. Mirrors the
 * api's `canCloseTicket` predicate; we evaluate it client-side to disable
 * the "Close ticket" button rather than wait for the api to reject it.
 */
export function canCloseTicket(items: ReadonlyArray<{ status?: TicketItemStatus | null }>): boolean {
  if (items.length === 0) return false;
  return items.every(
    (i) => i.status === TicketItemStatus.Served || i.status === TicketItemStatus.Voided,
  );
}

/**
 * Right-side panel that owns the active ticket. Owns the list of lines, the
 * totals block, the bottom action row, and every per-line/per-ticket
 * dialog. Refetches via `requestPolicy: 'network-only'` whenever a mutation
 * succeeds; the workspace also refetches in response to subscription
 * events.
 */
export function ActiveTicketPanel({
  ticketId,
  onTicketClosed,
  canManagerActions,
}: ActiveTicketPanelProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: TicketDocument,
    variables: { id: ticketId },
  });
  const [, updateLabel] = useMutation(UpdateTicketLabelDocument);
  const [, updateOrderType] = useMutation(UpdateTicketOrderTypeDocument);
  const [, fireAll] = useMutation(FireTicketDocument);
  const [, reopenTicket] = useMutation(ReopenTicketDocument);
  const [, linkGuest] = useMutation(LinkTicketGuestDocument);

  const ticket = data?.ticket ?? null;
  const items: Line[] = (ticket?.items ?? []).filter((i): i is Line => i != null && Boolean(i.id));

  const [labelEditing, setLabelEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string>(ticket?.customerLabel ?? '');
  const labelDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modifier-edit dialog state (when a NEW line's modifiers are being changed).
  const [modifyTarget, setModifyTarget] = useState<Line | null>(null);
  const [voidLineTarget, setVoidLineTarget] = useState<Line | null>(null);
  const [discountTarget, setDiscountTarget] = useState<
    | { kind: 'ticket' }
    | { kind: 'line'; line: Line }
    | null
  >(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [voidTicketOpen, setVoidTicketOpen] = useState(false);
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);

  useEffect(() => {
    if (ticket?.customerLabel !== undefined && !labelEditing) {
      setLabelDraft(ticket.customerLabel ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.customerLabel]);

  const refresh = (): void => {
    refetch({ requestPolicy: 'network-only' });
  };

  if (fetching && !ticket) {
    return <p className="p-3 text-sm text-muted-foreground">Loading ticket…</p>;
  }
  if (error) {
    return (
      <p className="p-3 text-sm text-destructive" role="alert">
        {error.message}
      </p>
    );
  }
  if (!ticket) {
    return <p className="p-3 text-sm text-muted-foreground">Ticket not found.</p>;
  }

  const status = ticket.status ?? TicketStatus.Open;
  const isClosed = status === TicketStatus.Closed;
  const isVoided = status === TicketStatus.Voided;
  const isOpen = status === TicketStatus.Open;
  const canClose = canCloseTicket(items.map((i) => ({ status: i.status })));
  const hasNew = items.some((i) => i.status === TicketItemStatus.New);
  const ticketLabel = `#${ticket.shortNumber ?? '—'}`;

  const onLabelChange = (next: string): void => {
    setLabelDraft(next);
    if (labelDebounce.current) clearTimeout(labelDebounce.current);
    labelDebounce.current = setTimeout(async () => {
      labelDebounce.current = null;
      const trimmed = next.trim();
      const result = await updateLabel({
        input: { ticketId, customerLabel: trimmed.length === 0 ? null : trimmed },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      refresh();
    }, 600);
  };

  const onOrderTypeChange = async (orderType: OrderType): Promise<void> => {
    const result = await updateOrderType({ input: { ticketId, orderType } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Order type updated');
    refresh();
  };

  const onFireAll = async (): Promise<void> => {
    const result = await fireAll({ input: { ticketId } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('All NEW lines fired');
    refresh();
  };

  const onReopen = async (): Promise<void> => {
    const result = await reopenTicket({ input: { ticketId } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Reopened ${ticketLabel}`);
    refresh();
  };

  const onPickGuest = async (guest: {
    id: string;
    name: string;
  }): Promise<void> => {
    const result = await linkGuest({
      input: { ticketId, guestId: guest.id },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setGuestPickerOpen(false);
    toast.success(`Linked ${guest.name}`);
    refresh();
  };

  const onUnlinkGuest = async (): Promise<void> => {
    const result = await linkGuest({
      input: { ticketId, guestId: null },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Guest unlinked');
    refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-2 border-b bg-surface px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{ticketLabel}</h2>
          <span className="text-xs text-muted-foreground">
            Opened {formatTime(ticket.openedAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {labelEditing ? (
            <Input
              autoFocus
              value={labelDraft}
              onChange={(e) => onLabelChange(e.target.value)}
              onBlur={() => setLabelEditing(false)}
              placeholder="e.g. Table 4"
              className="h-8 max-w-48"
              aria-label="Customer label"
            />
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm hover:underline"
              onClick={() => setLabelEditing(true)}
              aria-label="Edit customer label"
            >
              <span className={ticket.customerLabel ? '' : 'text-muted-foreground'}>
                {ticket.customerLabel || 'Add label'}
              </span>
              <Pencil className="h-3 w-3 opacity-60" aria-hidden />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={!isOpen}>
                {ticket.orderType ? ORDER_TYPE_LABEL[ticket.orderType] : '—'}
                <ChevronDown className="ml-1 h-3 w-3" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onOrderTypeChange(OrderType.DineIn)}>
                Dine-in
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOrderTypeChange(OrderType.Takeout)}>
                Takeout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="guest-row">
          <span className="text-muted-foreground">Guest:</span>
          {ticket.guest && ticket.guest.id ? (
            <>
              <span className="font-medium" data-testid="linked-guest-name">
                {ticket.guest.name ?? '—'}
              </span>
              {isOpen ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setGuestPickerOpen(true)}
                >
                  Change
                </Button>
              ) : null}
              {isOpen ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
                  onClick={onUnlinkGuest}
                >
                  Unlink
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => setGuestPickerOpen(true)}
              disabled={!isOpen}
              data-action="pick-guest"
            >
              Pick guest
            </Button>
          )}
        </div>
        {isClosed ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Closed at {formatTime(ticket.closedAt)} by {ticket.openedBy?.name ?? '—'}
          </div>
        ) : null}
        {isVoided ? (
          <div className="rounded-md border bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Voided at {formatTime(ticket.voidedAt)} — {ticket.voidReason ?? 'no reason'}
          </div>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No lines yet. Tap a menu tile to add one.
          </p>
        ) : (
          <ul className="flex flex-col">
            {items.map((line) => (
              <LineRow
                key={line.id ?? ''}
                line={line}
                onModifyModifiers={(l) => setModifyTarget(l)}
                onApplyDiscount={(l) => setDiscountTarget({ kind: 'line', line: l })}
                onVoidLine={(l) => setVoidLineTarget(l)}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </div>

      <TotalsBlock
        subtotalCents={ticket.subtotalCents ?? 0}
        discountCents={ticket.discountCents ?? 0}
        taxCents={ticket.taxCents ?? 0}
        totalCents={ticket.totalCents ?? 0}
      />

      <div className="flex flex-wrap items-center gap-2 border-t bg-surface px-3 py-3">
        {isOpen ? (
          <>
            {hasNew ? (
              <Button type="button" onClick={onFireAll}>
                Fire all
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setDiscountTarget({ kind: 'ticket' })}
            >
              Apply discount
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={!canClose}
              onClick={() => setCloseOpen(true)}
              title={canClose ? '' : 'All lines must be SERVED or VOIDED to close'}
            >
              Close ticket
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:bg-destructive/10"
              onClick={() => setVoidTicketOpen(true)}
            >
              Void ticket
            </Button>
          </>
        ) : null}
        {isClosed && canManagerActions ? (
          <Button type="button" variant="outline" onClick={onReopen}>
            Reopen ticket
          </Button>
        ) : null}
      </div>

      {modifyTarget && modifyTarget.id ? (
        <ModifierPicker
          open
          onOpenChange={(o) => {
            if (!o) setModifyTarget(null);
          }}
          menuItemId={modifyTarget.menuItem?.id ?? ''}
          mode={{ kind: 'edit', ticketItemId: modifyTarget.id }}
          initialSelectedIds={(modifyTarget.modifiers ?? [])
            .map((m) => m?.id)
            .filter((id): id is string => Boolean(id))}
          onSubmitted={() => {
            setModifyTarget(null);
            refresh();
          }}
        />
      ) : null}

      {voidLineTarget && voidLineTarget.id ? (
        <VoidLineDialog
          open
          onOpenChange={(o) => {
            if (!o) setVoidLineTarget(null);
          }}
          ticketItemId={voidLineTarget.id}
          itemLabel={voidLineTarget.nameSnapshot ?? 'this line'}
          onVoided={() => {
            setVoidLineTarget(null);
            refresh();
          }}
        />
      ) : null}

      {discountTarget?.kind === 'ticket' ? (
        <DiscountDialog
          open
          onOpenChange={(o) => {
            if (!o) setDiscountTarget(null);
          }}
          target={{
            kind: 'ticket',
            ticketId,
            sourceCents: ticket.subtotalCents ?? 0,
          }}
          onApplied={() => {
            setDiscountTarget(null);
            refresh();
          }}
        />
      ) : null}
      {discountTarget?.kind === 'line' && discountTarget.line.id ? (
        <DiscountDialog
          open
          onOpenChange={(o) => {
            if (!o) setDiscountTarget(null);
          }}
          target={{
            kind: 'line',
            ticketItemId: discountTarget.line.id,
            sourceCents: discountTarget.line.lineSubtotalCents ?? 0,
          }}
          onApplied={() => {
            setDiscountTarget(null);
            refresh();
          }}
        />
      ) : null}

      <CloseTicketDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        ticketId={ticketId}
        ticketLabel={ticketLabel}
        onClosed={() => {
          setCloseOpen(false);
          refresh();
          onTicketClosed?.();
        }}
      />
      <VoidTicketDialog
        open={voidTicketOpen}
        onOpenChange={setVoidTicketOpen}
        ticketId={ticketId}
        ticketLabel={ticketLabel}
        onVoided={() => {
          setVoidTicketOpen(false);
          refresh();
          onTicketClosed?.();
        }}
      />
      <GuestPicker
        open={guestPickerOpen}
        onClose={() => setGuestPickerOpen(false)}
        onPick={onPickGuest}
      />
    </div>
  );
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}
