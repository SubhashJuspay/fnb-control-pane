'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  formatMoney,
} from '@repo/ui';
import { Banknote, CreditCard, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  PrepayTicketDocument,
  ProcessCardPaymentAtTerminalDocument,
  TenderDocument,
  TenderStatus,
  type TenderMethod,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

interface PrepayTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketLabel: string;
  /** Ticket total before tip, in cents. */
  totalCents: number;
  onPrepaid: () => void;
}

const TIP_PRESETS: { label: string; pct: number }[] = [
  { label: 'No tip', pct: 0 },
  { label: '15%', pct: 15 },
  { label: '18%', pct: 18 },
  { label: '20%', pct: 20 },
];

type TipMode = { kind: 'preset'; pct: number } | { kind: 'custom'; cents: number };

type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE';

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { key: 'CARD', label: 'Card', Icon: CreditCard },
  { key: 'CASH', label: 'Cash', Icon: Banknote },
  { key: 'MOBILE', label: 'Mobile', Icon: Smartphone },
];

/**
 * Cash quick-tender presets — exact total, plus a few round
 * denominations >= the total.
 */
function buildCashPresets(totalCents: number): number[] {
  const presets = new Set<number>();
  presets.add(totalCents);
  for (const c of [5, 10, 20, 50, 100]) {
    const cents = c * 100;
    if (cents >= totalCents) presets.add(cents);
  }
  const nextTen = Math.ceil(totalCents / 1000) * 1000;
  if (nextTen > totalCents) presets.add(nextTen);
  return Array.from(presets).sort((a, b) => a - b).slice(0, 4);
}

/**
 * "Charge & fire" dialog used at counter-service spots — cashier
 * collects payment *before* the food is made. After capture, the
 * server fires all NEW items to the kitchen and leaves the ticket
 * OPEN so it can still be served + closed normally (the close flow
 * detects the captured tender and skips its own payment picker).
 *
 * Card/Mobile use the same simulator the legacy close path uses —
 * a real terminal handoff would be a separate flow (the WS
 * dispatcher would need to know whether to fire or close on capture).
 */
export function PrepayTicketDialog({
  open,
  onOpenChange,
  ticketId,
  ticketLabel,
  totalCents,
  onPrepaid,
}: PrepayTicketDialogProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ fetching: prepaying }, prepay] = useMutation(PrepayTicketDocument);
  const [{ fetching: dispatchingCard }, processCardAtTerminal] = useMutation(
    ProcessCardPaymentAtTerminalDocument,
  );

  const [tip, setTip] = useState<TipMode>({ kind: 'preset', pct: 0 });
  const [customDollars, setCustomDollars] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [cashTenderedCents, setCashTenderedCents] = useState<number | null>(null);
  const [cashCustomDollars, setCashCustomDollars] = useState<string>('');

  // Card-via-terminal flow: once we have a PENDING tender id from the
  // dispatch, we poll the tender until it settles. Mirrors the close
  // dialog's terminal flow.
  const [pendingTenderId, setPendingTenderId] = useState<string | null>(null);
  const successCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [{ data: tenderData }, reexecuteTender] = useQuery({
    query: TenderDocument,
    variables: { id: pendingTenderId ?? '' },
    pause: !pendingTenderId,
    requestPolicy: 'network-only',
  });
  // urql can briefly serve the previous response while a new request is
  // in flight; reject mismatched ids so a stale CAPTURED from a prior
  // dispatch doesn't auto-close this dialog.
  const tenderIdMatches = tenderData?.tender?.id === pendingTenderId;
  const tenderStatus = tenderIdMatches ? tenderData?.tender?.status ?? null : null;
  const tenderDeclineReason = tenderIdMatches
    ? tenderData?.tender?.declineReason ?? null
    : null;

  useEffect(() => {
    if (open) {
      if (successCloseTimeoutRef.current) {
        clearTimeout(successCloseTimeoutRef.current);
        successCloseTimeoutRef.current = null;
      }
      setTip({ kind: 'preset', pct: 0 });
      setCustomDollars('');
      setPaymentMethod('CARD');
      setCashTenderedCents(null);
      setCashCustomDollars('');
      setPendingTenderId(null);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (successCloseTimeoutRef.current) {
        clearTimeout(successCloseTimeoutRef.current);
        successCloseTimeoutRef.current = null;
      }
    };
  }, []);

  // Poll PENDING tenders every 1.5s — same cadence as the close dialog.
  // Stops as soon as the tender settles (CAPTURED / DECLINED / VOIDED).
  useEffect(() => {
    if (!pendingTenderId) return;
    if (
      tenderStatus === TenderStatus.Captured ||
      tenderStatus === TenderStatus.Declined ||
      tenderStatus === TenderStatus.Voided
    ) {
      return;
    }
    const handle = setInterval(
      () => reexecuteTender({ requestPolicy: 'network-only' }),
      1500,
    );
    return () => clearInterval(handle);
  }, [pendingTenderId, tenderStatus, reexecuteTender]);

  // React to terminal-driven status changes. CAPTURED on the prepay
  // intent means the dispatcher fired items + left the ticket OPEN.
  useEffect(() => {
    if (!pendingTenderId) return;
    if (tenderStatus === TenderStatus.Captured) {
      toast.success(`${ticketLabel} paid`);
      if (successCloseTimeoutRef.current) {
        clearTimeout(successCloseTimeoutRef.current);
      }
      successCloseTimeoutRef.current = setTimeout(() => {
        successCloseTimeoutRef.current = null;
        setPendingTenderId(null);
        onPrepaid();
      }, 700);
    } else if (
      tenderStatus === TenderStatus.Declined ||
      tenderStatus === TenderStatus.Voided
    ) {
      setPendingTenderId(null);
      toast.error(
        tenderDeclineReason
          ? `Card declined — ${tenderDeclineReason}`
          : 'Card declined — ask the customer for another tender.',
      );
    }
  }, [pendingTenderId, tenderStatus, tenderDeclineReason, ticketLabel, onPrepaid]);

  const isProcessingCard = pendingTenderId != null;

  const tipCents =
    tip.kind === 'preset' ? Math.round((totalCents * tip.pct) / 100) : tip.cents;
  const grandTotalCents = totalCents + tipCents;
  const cashPresets = buildCashPresets(grandTotalCents);
  const cashShort =
    cashTenderedCents != null ? cashTenderedCents < grandTotalCents : false;
  const changeDueCents =
    cashTenderedCents != null ? Math.max(0, cashTenderedCents - grandTotalCents) : 0;

  const busy = prepaying || dispatchingCard || isProcessingCard;
  const canSubmit =
    !busy &&
    (paymentMethod !== 'CASH' ||
      (cashTenderedCents != null && cashTenderedCents >= grandTotalCents));

  const onSubmit = async (): Promise<void> => {
    // Card / Mobile → dispatch to the paired POS terminal (same as the
    // close-ticket flow) with intent=PREPAY_TICKET so the dispatcher
    // fires items on capture instead of closing the ticket. The polling
    // effect above drives the UI from PENDING → CAPTURED / DECLINED.
    if (paymentMethod === 'CARD' || paymentMethod === 'MOBILE') {
      const result = await processCardAtTerminal({
        input: { ticketId, tipCents, intent: 'PREPAY_TICKET' },
      });
      if (result.error) {
        toast.error(
          result.error.message.includes('terminal')
            ? result.error.message
            : `Could not start card payment — ${result.error.message}`,
        );
        return;
      }
      const tenderId = result.data?.processCardPaymentAtTerminal?.tenderId;
      if (!tenderId) {
        toast.error('Payment dispatch did not return a tender id.');
        return;
      }
      setPendingTenderId(tenderId);
      return;
    }

    // Cash → synchronous capture via prepayTicket (the simulator path
    // doesn't need the WS terminal). On success the server has already
    // fired items + stamped the tender; the ticket stays OPEN.
    if (
      cashTenderedCents == null ||
      cashTenderedCents < grandTotalCents
    ) {
      toast.error('Cash tendered must cover the grand total.');
      return;
    }
    const result = await prepay({
      input: {
        ticketId,
        closeNote: null,
        tenders: [
          {
            method: paymentMethod as TenderMethod,
            amountCents: totalCents,
            tipCents,
            tenderedCents: cashTenderedCents,
          },
        ],
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`${ticketLabel} paid`);
    onPrepaid();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Take payment for {ticketLabel}</DialogTitle>
          <DialogDescription>
            Charge the customer now. The ticket stays open until the food
            is served — closing then just clears it with no further charge.
            Any items still waiting to fire go to the kitchen on capture.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span>Total before tip</span>
              <span className="font-medium tabular-nums" data-testid="prepay-pretotal">
                {formatMoney(totalCents, currency)}
              </span>
            </div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Tip
            </Label>
            <div className="grid grid-cols-4 gap-1.5" role="group">
              {TIP_PRESETS.map((p) => {
                const active = tip.kind === 'preset' && tip.pct === p.pct;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setTip({ kind: 'preset', pct: p.pct });
                      setCustomDollars('');
                    }}
                    aria-pressed={active}
                    className={[
                      'rounded-md border px-2 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted/40',
                    ].join(' ')}
                  >
                    {p.label}
                    {p.pct > 0 ? (
                      <span className="ml-1 text-xs opacity-80 tabular-nums">
                        {formatMoney(
                          Math.round((totalCents * p.pct) / 100),
                          currency,
                        )}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="prepay-custom-tip" className="text-xs text-muted-foreground">
                Custom
              </Label>
              <input
                id="prepay-custom-tip"
                inputMode="decimal"
                placeholder="0.00"
                value={customDollars}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomDollars(v);
                  const dollars = Number.parseFloat(v);
                  if (Number.isFinite(dollars) && dollars >= 0) {
                    setTip({ kind: 'custom', cents: Math.round(dollars * 100) });
                  } else {
                    setTip({ kind: 'preset', pct: 0 });
                  }
                }}
                className="h-9 w-28 rounded-md border bg-background px-3 text-sm"
              />
              <span className="text-xs text-muted-foreground">{currency}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm font-semibold">
              <span>Grand total</span>
              <span className="tabular-nums" data-testid="prepay-grand-total">
                {formatMoney(grandTotalCents, currency)}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Payment method
            </Label>
            <div className="grid grid-cols-3 gap-1.5" role="group">
              {PAYMENT_OPTIONS.map(({ key, label, Icon }) => {
                const active = paymentMethod === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPaymentMethod(key)}
                    aria-pressed={active}
                    className={[
                      'flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted/40',
                    ].join(' ')}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {paymentMethod === 'CASH' ? (
            <section className="flex flex-col gap-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Cash tendered
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                {cashPresets.map((cents) => {
                  const active = cashTenderedCents === cents;
                  return (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => {
                        setCashTenderedCents(cents);
                        setCashCustomDollars('');
                      }}
                      aria-pressed={active}
                      className={[
                        'rounded-md border px-2 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-muted/40',
                      ].join(' ')}
                    >
                      {formatMoney(cents, currency)}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="prepay-cash-custom" className="text-xs text-muted-foreground">
                  Custom
                </Label>
                <input
                  id="prepay-cash-custom"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={cashCustomDollars}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCashCustomDollars(v);
                    const dollars = Number.parseFloat(v);
                    if (Number.isFinite(dollars) && dollars >= 0) {
                      setCashTenderedCents(Math.round(dollars * 100));
                    } else {
                      setCashTenderedCents(null);
                    }
                  }}
                  className="h-9 w-28 rounded-md border bg-background px-3 text-sm"
                />
                <span className="text-xs text-muted-foreground">{currency}</span>
              </div>
              {cashTenderedCents != null ? (
                <p
                  className={[
                    'text-sm font-medium',
                    cashShort ? 'text-destructive' : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {cashShort
                    ? `Short by ${formatMoney(grandTotalCents - cashTenderedCents, currency)}`
                    : `Change due: ${formatMoney(changeDueCents, currency)}`}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="prepay-submit"
          >
            {isProcessingCard ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Waiting for card tap…
              </span>
            ) : busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Charging…
              </span>
            ) : (
              `Charge ${formatMoney(grandTotalCents, currency)}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
