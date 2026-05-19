'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { closeTicketSchema } from '@repo/validation/ticket';
import {
  CloseTicketDocument,
  ProcessCardPaymentAtTerminalDocument,
  ProcessPaymentDocument,
  TenderDocument,
  TenderStatus,
  type TenderMethod,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

const emptyToUndef = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const formSchema = z.object({
  closeNote: z.preprocess(emptyToUndef, closeTicketSchema.shape.closeNote),
});

type FormValues = z.infer<typeof formSchema>;

interface CloseTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketLabel: string;
  /** Pre-tip ticket total in cents — used to drive the % buttons. */
  totalCents: number;
  onClosed: () => void;
}

const TIP_PRESETS: { label: string; pct: number }[] = [
  { label: 'No tip', pct: 0 },
  { label: '15%', pct: 15 },
  { label: '18%', pct: 18 },
  { label: '20%', pct: 20 },
];

type TipMode =
  | { kind: 'preset'; pct: number }
  | { kind: 'custom'; cents: number };

type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE';
type PaymentPhase = 'idle' | 'processing' | 'confirmed';

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { key: 'CARD', label: 'Card', Icon: CreditCard },
  { key: 'CASH', label: 'Cash', Icon: Banknote },
  { key: 'MOBILE', label: 'Mobile', Icon: Smartphone },
];

/**
 * Cash quick-tender presets: Exact, then the next 3 useful round
 * denominations >= the total. Avoids dupes (e.g. if total is $20.00 we don't
 * show "$20" twice) and never offers a tender < the total.
 */
function buildCashPresets(totalCents: number): number[] {
  const presets = new Set<number>();
  presets.add(totalCents); // Exact
  const candidates = [5, 10, 20, 50, 100];
  for (const c of candidates) {
    const cents = c * 100;
    if (cents >= totalCents) presets.add(cents);
  }
  // Always offer at least one "round up" option — useful when the total is
  // already huge (e.g. $87) so we suggest the next $10 ceiling.
  const nextTen = Math.ceil(totalCents / 1000) * 1000;
  if (nextTen > totalCents) presets.add(nextTen);
  return Array.from(presets).sort((a, b) => a - b).slice(0, 4);
}

// Demo-only processing-delay was retained for legacy callers but the real
// `processPayment` mutation now drives the simulated delay server-side
// (1-2s randomised authorize + configurable decline rate). The const is
// no longer referenced; leaving the comment so future readers know why
// there's no client-side `setTimeout(processingMs)`.
//
// (intentionally unused — removed)

export function CloseTicketDialog({
  open,
  onOpenChange,
  ticketId,
  ticketLabel,
  totalCents,
  onClosed,
}: CloseTicketDialogProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [, closeTicket] = useMutation(CloseTicketDocument);
  const [, processPayment] = useMutation(ProcessPaymentDocument);
  const [, processCardAtTerminal] = useMutation(ProcessCardPaymentAtTerminalDocument);
  void closeTicket; // retained for legacy callers / tests; processPayment is the new path
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: { closeNote: undefined },
  });
  const { register, handleSubmit, reset, formState } = form;
  const { errors, isSubmitting } = formState;

  const [tip, setTip] = useState<TipMode>({ kind: 'preset', pct: 0 });
  const [customDollars, setCustomDollars] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const [cashTenderedCents, setCashTenderedCents] = useState<number | null>(null);
  const [cashCustomDollars, setCashCustomDollars] = useState<string>('');

  /**
   * Set after processCardPaymentAtTerminal succeeds — the Tender row's id
   * is what the WS dispatcher routes the terminal response to. While set,
   * we poll the tender every ~1.5s and react to PENDING → CAPTURED / DECLINED.
   */
  const [pendingTenderId, setPendingTenderId] = useState<string | null>(null);

  const [{ data: tenderData }, reexecuteTender] = useQuery({
    query: TenderDocument,
    variables: { id: pendingTenderId ?? '' },
    pause: !pendingTenderId,
    requestPolicy: 'network-only',
  });
  const tenderStatus = tenderData?.tender?.status ?? null;
  const tenderDeclineReason = tenderData?.tender?.declineReason ?? null;

  useEffect(() => {
    if (open) {
      reset({ closeNote: undefined });
      setTip({ kind: 'preset', pct: 0 });
      setCustomDollars('');
      setPaymentMethod('CARD');
      setPhase('idle');
      setCashTenderedCents(null);
      setCashCustomDollars('');
      setPendingTenderId(null);
    }
  }, [open, reset]);

  // Poll the pending tender every 1.5s until it settles. The dispatcher's
  // 60s auto-expire keeps this from hanging forever even if the terminal
  // never responds.
  useEffect(() => {
    if (!pendingTenderId) return;
    if (tenderStatus === TenderStatus.Captured || tenderStatus === TenderStatus.Declined ||
        tenderStatus === TenderStatus.Voided) {
      return;
    }
    const handle = setInterval(
      () => reexecuteTender({ requestPolicy: 'network-only' }),
      1500,
    );
    return () => clearInterval(handle);
  }, [pendingTenderId, tenderStatus, reexecuteTender]);

  // React to terminal-driven status changes.
  useEffect(() => {
    if (!pendingTenderId) return;
    if (tenderStatus === TenderStatus.Captured) {
      setPhase('confirmed');
      toast.success(`Payment received — ${ticketLabel} closed`);
      setTimeout(() => {
        setPendingTenderId(null);
        onClosed();
      }, 700);
    } else if (
      tenderStatus === TenderStatus.Declined ||
      tenderStatus === TenderStatus.Voided
    ) {
      setPhase('idle');
      setPendingTenderId(null);
      toast.error(
        tenderDeclineReason
          ? `Card declined — ${tenderDeclineReason}`
          : 'Card declined — ask the customer for another tender.',
      );
    }
  }, [pendingTenderId, tenderStatus, tenderDeclineReason, ticketLabel, onClosed]);

  const tipCents =
    tip.kind === 'preset'
      ? Math.round((totalCents * tip.pct) / 100)
      : tip.cents;
  const grandTotalCents = totalCents + tipCents;
  const cashPresets = buildCashPresets(grandTotalCents);
  const cashShort =
    cashTenderedCents != null ? cashTenderedCents < grandTotalCents : false;
  const changeDueCents =
    cashTenderedCents != null ? Math.max(0, cashTenderedCents - grandTotalCents) : 0;

  const onSubmit = handleSubmit(async (values) => {
    // CARD / MOBILE → dispatch to the paired POS terminal and wait for the
    // tap result. Real customer-facing card flow, no inline simulator.
    if (paymentMethod === 'CARD' || paymentMethod === 'MOBILE') {
      setPhase('processing');
      const result = await processCardAtTerminal({
        input: { ticketId, tipCents },
      });
      if (result.error) {
        setPhase('idle');
        // The dispatcher throws ConflictError when no terminal is online —
        // surface that as a clear, actionable error.
        toast.error(
          result.error.message.includes('terminal')
            ? result.error.message
            : `Could not start card payment — ${result.error.message}`,
        );
        return;
      }
      const tenderId = result.data?.processCardPaymentAtTerminal?.tenderId;
      if (!tenderId) {
        setPhase('idle');
        toast.error('Payment dispatch did not return a tender id.');
        return;
      }
      // From here on, the polling effect drives the rest of the flow:
      // PENDING → CAPTURED closes the ticket, DECLINED resets to idle.
      setPendingTenderId(tenderId);
      return;
    }

    // CASH path — synchronous, no terminal involved. Validate the cash
    // tender before kicking off the call.
    if (cashTenderedCents == null || cashTenderedCents < grandTotalCents) {
      toast.error('Cash tendered must cover the grand total.');
      return;
    }
    setPhase('processing');
    const tenderInput: {
      method: TenderMethod;
      amountCents: number;
      tipCents: number;
      tenderedCents: number | null;
    } = {
      method: paymentMethod as TenderMethod,
      amountCents: totalCents,
      tipCents,
      tenderedCents: cashTenderedCents,
    };
    const result = await processPayment({
      input: {
        ticketId,
        tenders: [tenderInput],
        closeNote: values.closeNote ?? null,
      },
    });
    if (result.error) {
      setPhase('idle');
      toast.error(result.error.message);
      return;
    }
    setPhase('confirmed');
    toast.success(`Payment received — ${ticketLabel} closed`);
    setTimeout(() => onClosed(), 700);
  });

  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.key === paymentMethod)?.label ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Close {ticketLabel}</DialogTitle>
          <DialogDescription>
            Closing finalizes the totals. You can still reopen the ticket later if
            needed.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span>Total before tip</span>
              <span className="font-medium tabular-nums" data-testid="close-pretotal">
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
                    onClick={() => setTip({ kind: 'preset', pct: p.pct })}
                    data-testid={`close-tip-preset-${p.pct}`}
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
              <Label htmlFor="close-custom-tip" className="text-xs text-muted-foreground">
                Custom
              </Label>
              <input
                id="close-custom-tip"
                data-testid="close-tip-custom"
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
              <span className="tabular-nums" data-testid="close-grand-total">
                {formatMoney(grandTotalCents, currency)}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Payment method
            </Label>
            <div className="grid grid-cols-3 gap-1.5" role="group">
              {PAYMENT_OPTIONS.map((opt) => {
                const active = opt.key === paymentMethod;
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(opt.key);
                      if (opt.key !== 'CASH') {
                        setCashTenderedCents(null);
                        setCashCustomDollars('');
                      }
                    }}
                    data-testid={`close-payment-${opt.key.toLowerCase()}`}
                    aria-pressed={active}
                    className={[
                      'flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted/40',
                    ].join(' ')}
                  >
                    <Icon className="size-4" aria-hidden />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {paymentMethod === 'CASH' ? (
            <section
              className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
              data-testid="close-cash-tender"
            >
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Cash tendered
              </Label>
              <div className="grid grid-cols-4 gap-1.5" role="group">
                {cashPresets.map((cents) => {
                  const active = cashTenderedCents === cents;
                  const isExact = cents === grandTotalCents;
                  return (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => {
                        setCashTenderedCents(cents);
                        setCashCustomDollars('');
                      }}
                      data-testid={`close-cash-preset-${cents}`}
                      aria-pressed={active}
                      className={[
                        'flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-sm font-semibold tabular-nums transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <span>{formatMoney(cents, currency)}</span>
                      {isExact ? (
                        <span
                          className={[
                            'text-[10px] font-medium uppercase tracking-wide',
                            active ? 'text-primary-foreground/85' : 'text-muted-foreground',
                          ].join(' ')}
                        >
                          Exact
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="close-cash-custom"
                  className="text-xs text-muted-foreground"
                >
                  Other
                </Label>
                <input
                  id="close-cash-custom"
                  data-testid="close-cash-custom"
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
                  className="h-9 w-32 rounded-md border bg-background px-3 text-sm"
                />
                <span className="text-xs text-muted-foreground">{currency}</span>
              </div>
              <div
                className={[
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm',
                  cashTenderedCents == null
                    ? 'bg-background text-muted-foreground'
                    : cashShort
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
                ].join(' ')}
                data-testid="close-cash-change"
              >
                <span className="font-medium">
                  {cashTenderedCents == null
                    ? 'Pick a tendered amount'
                    : cashShort
                      ? 'Short'
                      : 'Change due'}
                </span>
                <span className="font-semibold tabular-nums">
                  {cashTenderedCents == null
                    ? '—'
                    : cashShort
                      ? `−${formatMoney(grandTotalCents - cashTenderedCents, currency)}`
                      : formatMoney(changeDueCents, currency)}
                </span>
              </div>
            </section>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="close-ticket-note">Close note (optional)</Label>
            <textarea
              id="close-ticket-note"
              rows={3}
              placeholder="Optional context for the audit log"
              className="rounded-md border bg-background px-3 py-2 text-sm"
              {...register('closeNote')}
            />
            {errors.closeNote ? (
              <p className="text-xs text-destructive">{errors.closeNote.message}</p>
            ) : null}
          </div>
          </div>
          <DialogFooter className="mt-4 shrink-0 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={phase !== 'idle'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                phase !== 'idle' ||
                (paymentMethod === 'CASH' && (cashTenderedCents == null || cashShort))
              }
              data-testid="close-ticket-submit"
              title={
                paymentMethod === 'CASH' && cashTenderedCents == null
                  ? 'Pick a tendered amount'
                  : paymentMethod === 'CASH' && cashShort
                    ? 'Tendered amount is less than the total'
                    : ''
              }
            >
              {paymentMethod === 'CASH' && changeDueCents > 0 && !cashShort
                ? `Pay ${formatMoney(grandTotalCents, currency)} • Change ${formatMoney(changeDueCents, currency)}`
                : `Pay ${formatMoney(grandTotalCents, currency)} • ${paymentLabel}`}
            </Button>
          </DialogFooter>
        </form>
        {phase !== 'idle' ? (
          <div
            // Inline style for the backdrop: the Tailwind `bg-background/95`
            // alpha modifier doesn't work on the M3 colour tokens because
            // they expand to raw `var(--m3-background)` which Tailwind 3
            // can't blend with `<alpha-value>`. Hard-coded RGBA against the
            // M3 surface colour gives a solid 96%-opaque backdrop in light
            // mode + a tone that matches in dark (Radix's portal sits on a
            // backdrop-blurred surface so a slightly-translucent overlay
            // still reads as "modal-over-modal").
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg px-6 text-center backdrop-blur-sm"
            style={{
              backgroundColor: 'var(--m3-surface-container-lowest)',
            }}
            role="status"
            aria-live="polite"
            data-testid="payment-overlay"
            data-phase={phase}
          >
            {phase === 'processing' ? (
              paymentMethod === 'CARD' || paymentMethod === 'MOBILE' ? (
                // Real-terminal flow: the customer taps on the paired POS
                // terminal. We just animate the wait and react to status
                // changes pushed in via the WebSocket roundtrip.
                <>
                  <div className="relative flex size-28 items-center justify-center">
                    <span
                      aria-hidden
                      className="absolute inset-0 animate-ping rounded-full bg-primary/20"
                      style={{ animationDuration: '1.8s' }}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-3 animate-ping rounded-full bg-primary/25"
                      style={{ animationDuration: '1.8s', animationDelay: '0.5s' }}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-6 rounded-full bg-primary"
                      style={{ boxShadow: '0 10px 24px -8px rgba(79,70,229,0.55)' }}
                    />
                    <span
                      aria-hidden
                      className="material-symbols-outlined relative text-[40px] text-on-primary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {paymentMethod === 'MOBILE' ? 'contactless' : 'credit_card'}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-on-surface">
                    Tap card on terminal
                  </p>
                  <p className="text-status-pill text-on-surface-variant">
                    {formatMoney(grandTotalCents, currency)} — ask the customer to
                    present their card.
                  </p>
                  <p className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                    <span className="size-2 animate-pulse rounded-full bg-primary" />
                    Waiting for terminal
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
                  <p className="text-sm font-semibold">
                    Recording {paymentLabel.toLowerCase()} payment…
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(grandTotalCents, currency)}
                  </p>
                </>
              )
            ) : (
              <>
                <CheckCircle2
                  className="size-12 text-emerald-600"
                  aria-hidden
                />
                <p className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
                  {paymentMethod === 'CARD' || paymentMethod === 'MOBILE'
                    ? 'Approved'
                    : 'Payment received'}
                </p>
                <p className="text-xs text-muted-foreground">Closing ticket…</p>
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
