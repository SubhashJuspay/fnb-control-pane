'use client';

import { useEffect, useState } from 'react';
import { useQuery } from 'urql';
import { formatMoney } from '@repo/ui';
import {
  OnlineOrderPaymentStatus,
  TrackOnlineOrderDocument,
} from '@/lib/graphql/generated/graphql';

export interface KioskPaymentOverlayProps {
  tenantSlug: string;
  locationSlug: string;
  trackingToken: string;
  amountCents: number;
  currency: string;
  /** Table slug from `?table=` — shown in the success copy. */
  tableSlug?: string | null;
  /** Called when the customer wants to retry (e.g. after a decline). */
  onDismiss: () => void;
  /** Called once we want the drawer to drop the cart + return to the menu. */
  onCaptured: () => void;
}

const POLL_INTERVAL_MS = 1500;
const SUCCESS_HOLD_MS = 5000;

/**
 * Full-screen overlay shown after the kiosk submits a PAY_AT_KIOSK order.
 * Polls `trackOnlineOrder` every ~1.5s for the terminal's payment_result.
 *
 * - paymentStatus = PENDING → "Reading card…" animation + amount
 * - paymentStatus = CAPTURED → celebration screen + 5s hold + redirect-to-menu
 * - paymentStatus = DECLINED → retry / cancel buttons
 * - server timeout (60s) → server flips to DECLINED with a "timed out" reason
 */
export function KioskPaymentOverlay({
  tenantSlug: _tenantSlug,
  locationSlug: _locationSlug,
  trackingToken,
  amountCents,
  currency,
  tableSlug,
  onDismiss,
  onCaptured,
}: KioskPaymentOverlayProps): React.JSX.Element {
  const [{ data }, reexecuteQuery] = useQuery({
    query: TrackOnlineOrderDocument,
    variables: { token: trackingToken },
    requestPolicy: 'network-only',
  });
  const status = data?.trackOnlineOrder?.paymentStatus ?? null;
  const rejectReason = data?.trackOnlineOrder?.rejectReason ?? null;
  const shortNumber = data?.trackOnlineOrder?.shortNumber ?? null;
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(SUCCESS_HOLD_MS / 1000));

  // Poll until the terminal returns a final result. `reexecuteQuery` is the
  // stable refetch handle returned by useQuery (an earlier draft tried to
  // re-key the query via `context: { tick }` which created a new object
  // every render and tripped React error #301).
  useEffect(() => {
    if (status === 'CAPTURED' || status === 'DECLINED') return;
    const t = setInterval(
      () => reexecuteQuery({ requestPolicy: 'network-only' }),
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(t);
  }, [status, reexecuteQuery]);

  // On success: short celebration, then hand control back to the drawer
  // which clears the cart and pushes us back to /order...?kiosk=1.
  useEffect(() => {
    if (status !== OnlineOrderPaymentStatus.Captured) return;
    setSecondsLeft(Math.ceil(SUCCESS_HOLD_MS / 1000));
    const tick = setInterval(() => {
      setSecondsLeft((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    const handle = setTimeout(() => {
      onCaptured();
    }, SUCCESS_HOLD_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(handle);
    };
  }, [status, onCaptured]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{ backgroundColor: 'var(--m3-background)' }}
      role="dialog"
      aria-modal
      data-testid="kiosk-payment-overlay"
    >
      <div className="relative flex w-full max-w-2xl flex-col">
        {status === OnlineOrderPaymentStatus.Captured ? (
          <ApprovedView
            amountCents={amountCents}
            currency={currency}
            tableSlug={tableSlug ?? null}
            shortNumber={shortNumber}
            secondsLeft={secondsLeft}
            onContinue={onCaptured}
          />
        ) : status === OnlineOrderPaymentStatus.Declined ? (
          <DeclinedView reason={rejectReason} onRetry={onDismiss} onCancel={onDismiss} />
        ) : (
          <PendingView
            amountCents={amountCents}
            currency={currency}
            tableSlug={tableSlug ?? null}
            onCancel={onDismiss}
          />
        )}
      </div>
    </div>
  );
}

function PendingView({
  amountCents,
  currency,
  tableSlug,
  onCancel,
}: {
  amountCents: number;
  currency: number | string;
  tableSlug: string | null;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="material-symbols-outlined text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            point_of_sale
          </span>
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Kiosk payment {tableSlug ? `· Table ${tableSlug}` : ''}
          </span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 font-label-caps text-label-caps uppercase tracking-wider text-success">
          <span className="material-symbols-outlined text-[14px]">lock</span>
          Secure
        </span>
      </div>

      {/* Content stack — centered vertically in the remaining space so the
          amount, tap prompt, and cancel button stay grouped together on tall
          kiosk screens instead of stretching apart. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-stack-loose px-6 py-6">
        {/* Amount */}
        <div className="flex flex-col items-center">
          <span className="font-label-caps text-label-caps uppercase tracking-[0.2em] text-on-surface-variant">
            Total due
          </span>
          <div
            className="mt-2 font-display tabular-nums leading-none text-on-background"
            style={{ fontSize: 'clamp(56px, 11vw, 96px)', fontWeight: 800, letterSpacing: '-0.02em' }}
          >
            {formatMoney(amountCents, String(currency))}
          </div>
        </div>

        {/* Tap-prompt card */}
        <div className="flex w-full flex-col items-center gap-6 rounded-3xl bg-surface px-6 py-10 shadow-card-soft">
          <div className="relative flex size-44 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full bg-primary/20"
              style={{ animationDuration: '1.8s' }}
            />
            <span
              aria-hidden
              className="absolute inset-4 animate-ping rounded-full bg-primary/25"
              style={{ animationDuration: '1.8s', animationDelay: '0.5s' }}
            />
            <span
              aria-hidden
              className="absolute inset-8 rounded-full bg-primary"
              style={{ boxShadow: '0 12px 30px -8px rgba(79,70,229,0.55)' }}
            />
            <span
              aria-hidden
              className="material-symbols-outlined relative text-[56px] text-on-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              contactless
            </span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="font-display text-display-md font-bold text-on-surface">
              Tap, insert, or swipe
            </h1>
            <p className="max-w-sm text-body-customer text-on-surface-variant">
              Hold your card near the terminal next to the kiosk and follow the
              on-screen prompts.
            </p>
          </div>
          <PaymentMethodRow />
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1.5 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            Waiting for terminal
          </div>
        </div>

        {/* Cancel — kept small + faint so it doesn't compete with the tap
            prompt. Sits directly under the card now, no flex-stretch gap. */}
        <button
          type="button"
          onClick={onCancel}
          data-testid="kiosk-payment-cancel"
          className="rounded-xl px-6 py-3 text-body-staff font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          Cancel payment
        </button>
      </div>
    </div>
  );
}

function PaymentMethodRow(): React.JSX.Element {
  const methods: Array<{ icon: string; label: string; dimmed?: boolean }> = [
    { icon: 'contactless', label: 'Tap' },
    { icon: 'credit_card', label: 'Chip' },
    { icon: 'credit_score', label: 'Swipe', dimmed: true },
  ];
  return (
    <div className="flex items-center gap-4">
      {methods.map((m, i) => (
        <div key={m.label} className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <span
              aria-hidden
              className={`material-symbols-outlined text-[22px] ${m.dimmed ? 'text-on-surface-variant/50' : 'text-primary'}`}
              style={{ fontVariationSettings: m.dimmed ? '' : "'FILL' 1" }}
            >
              {m.icon}
            </span>
            <span
              className={`font-label-caps text-[10px] uppercase tracking-wider ${m.dimmed ? 'text-on-surface-variant/50' : 'text-on-surface-variant'}`}
            >
              {m.label}
            </span>
          </div>
          {i < methods.length - 1 ? (
            <span className="size-1 rounded-full bg-on-surface-variant/40" aria-hidden />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ApprovedView({
  amountCents,
  currency,
  tableSlug,
  shortNumber,
  secondsLeft,
  onContinue,
}: {
  amountCents: number;
  currency: number | string;
  tableSlug: string | null;
  shortNumber: number | null;
  secondsLeft: number;
  onContinue: () => void;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="relative flex size-32 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-success/15"
        />
        <span
          aria-hidden
          className="absolute inset-2 rounded-full bg-success/25"
        />
        <span
          aria-hidden
          className="relative flex size-24 items-center justify-center rounded-full bg-success"
          style={{ boxShadow: '0 12px 30px -8px rgba(16,185,129,0.55)' }}
        >
          <span
            aria-hidden
            className="material-symbols-outlined text-[56px] text-white"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check
          </span>
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-display-lg font-bold text-on-background">
          Payment approved
        </h1>
        <p className="font-display text-headline-md tabular-nums font-semibold text-on-surface-variant">
          {formatMoney(amountCents, String(currency))}
          {shortNumber != null ? <> · Order #{shortNumber}</> : null}
        </p>
      </div>

      <div className="mt-2 flex max-w-md flex-col items-center gap-3 rounded-2xl bg-surface px-8 py-6 shadow-card-soft">
        <span
          aria-hidden
          className="material-symbols-outlined text-[40px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {tableSlug ? 'table_restaurant' : 'restaurant'}
        </span>
        <p className="text-body-customer font-semibold text-on-surface">
          {tableSlug
            ? `We'll bring your order to Table ${tableSlug}`
            : "We're sending your order to the kitchen"}
        </p>
        <p className="text-body-staff text-on-surface-variant">
          Sit tight — your food will be on its way shortly.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-on-primary shadow-card-soft transition-transform active:scale-95"
        data-testid="kiosk-payment-continue"
      >
        Order something else
        <span className="material-symbols-outlined">arrow_forward</span>
      </button>
      <p className="text-status-pill uppercase tracking-wider text-on-surface-variant">
        Returning to menu in {secondsLeft}s
      </p>
    </div>
  );
}

function DeclinedView({
  reason,
  onRetry,
  onCancel,
}: {
  reason: string | null;
  onRetry: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex size-32 items-center justify-center rounded-full bg-error-container">
        <span
          aria-hidden
          className="material-symbols-outlined text-[64px] text-error"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          close
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-display-lg font-bold text-on-background">
          Card declined
        </h1>
        <p className="max-w-md text-body-customer text-on-surface-variant">
          {reason ?? 'The terminal could not authorize this card.'}
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-primary px-6 py-4 font-bold text-on-primary shadow-card-soft transition-transform active:scale-95"
          data-testid="kiosk-payment-retry"
        >
          Try another card
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-6 py-3 text-body-staff font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
