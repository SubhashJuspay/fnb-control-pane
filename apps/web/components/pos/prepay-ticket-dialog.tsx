'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'urql';
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
  const [{ fetching }, prepay] = useMutation(PrepayTicketDocument);

  const [tip, setTip] = useState<TipMode>({ kind: 'preset', pct: 0 });
  const [customDollars, setCustomDollars] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [cashTenderedCents, setCashTenderedCents] = useState<number | null>(null);
  const [cashCustomDollars, setCashCustomDollars] = useState<string>('');

  useEffect(() => {
    if (open) {
      setTip({ kind: 'preset', pct: 0 });
      setCustomDollars('');
      setPaymentMethod('CARD');
      setCashTenderedCents(null);
      setCashCustomDollars('');
    }
  }, [open]);

  const tipCents =
    tip.kind === 'preset' ? Math.round((totalCents * tip.pct) / 100) : tip.cents;
  const grandTotalCents = totalCents + tipCents;
  const cashPresets = buildCashPresets(grandTotalCents);
  const cashShort =
    cashTenderedCents != null ? cashTenderedCents < grandTotalCents : false;
  const changeDueCents =
    cashTenderedCents != null ? Math.max(0, cashTenderedCents - grandTotalCents) : 0;

  const canSubmit =
    !fetching &&
    (paymentMethod !== 'CASH' ||
      (cashTenderedCents != null && cashTenderedCents >= grandTotalCents));

  const onSubmit = async (): Promise<void> => {
    if (paymentMethod === 'CASH' && (cashTenderedCents == null || cashTenderedCents < grandTotalCents)) {
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
            tenderedCents:
              paymentMethod === 'CASH' ? cashTenderedCents : null,
          },
        ],
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`${ticketLabel} paid — order fired to kitchen`);
    onPrepaid();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Take payment for {ticketLabel}</DialogTitle>
          <DialogDescription>
            Charge the customer now and we&apos;ll fire the order to the
            kitchen right away. The ticket stays open until the food is
            served, but no further payment is taken on close.
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
            disabled={fetching}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="prepay-submit"
          >
            {fetching ? (
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
