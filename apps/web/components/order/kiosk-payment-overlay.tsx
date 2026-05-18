'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  /** Closed via the user backing out of the overlay (e.g. "Cancel" pressed). */
  onDismiss: () => void;
}

const POLL_INTERVAL_MS = 1500;

/**
 * Full-screen overlay shown after the kiosk submits a PAY_AT_KIOSK order.
 * Polls `trackOnlineOrder` every ~1.5s for the terminal's payment_result.
 *
 * - paymentStatus = PENDING → "Reading card…" animation
 * - paymentStatus = CAPTURED → green check, then route to /confirmation
 * - paymentStatus = DECLINED → red icon with retry / cancel buttons
 * - server timeout (60s) → server flips to DECLINED with a "timed out" reason
 */
export function KioskPaymentOverlay({
  tenantSlug,
  locationSlug,
  trackingToken,
  amountCents,
  currency,
  onDismiss,
}: KioskPaymentOverlayProps): React.JSX.Element {
  const router = useRouter();
  const [pollTick, setPollTick] = useState(0);
  const [{ data }] = useQuery({
    query: TrackOnlineOrderDocument,
    variables: { token: trackingToken },
    requestPolicy: 'network-only',
    // Re-runs whenever pollTick changes (we bump it on a timer below).
    context: { pollTick } as Record<string, unknown>,
  });
  const status = data?.trackOnlineOrder?.paymentStatus ?? null;
  const rejectReason = data?.trackOnlineOrder?.rejectReason ?? null;

  useEffect(() => {
    if (status === 'CAPTURED' || status === 'DECLINED') return;
    const t = setInterval(() => setPollTick((n) => n + 1), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [status]);

  // On success: short celebration, then route.
  useEffect(() => {
    if (status !== OnlineOrderPaymentStatus.Captured) return;
    const handle = setTimeout(() => {
      router.push(
        `/order/${tenantSlug}/${locationSlug}/confirmation/${trackingToken}`,
      );
    }, 1400);
    return () => clearTimeout(handle);
  }, [status, router, tenantSlug, locationSlug, trackingToken]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 text-center"
      style={{ backgroundColor: 'var(--m3-surface-container-lowest)' }}
      role="dialog"
      aria-modal
      data-testid="kiosk-payment-overlay"
    >
      <p className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
        Card terminal · {formatMoney(amountCents, currency)}
      </p>

      {status === null || status === OnlineOrderPaymentStatus.Pending ? (
        <ReadingCard />
      ) : status === OnlineOrderPaymentStatus.Captured ? (
        <Approved amountCents={amountCents} currency={currency} />
      ) : (
        <Declined reason={rejectReason} onRetry={onDismiss} />
      )}
    </div>
  );
}

function ReadingCard(): React.JSX.Element {
  return (
    <div className="flex max-w-md flex-col items-center gap-6">
      <div className="relative flex size-40 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-primary/20"
        />
        <span
          aria-hidden
          className="absolute inset-4 animate-pulse rounded-full bg-primary/30"
        />
        <span
          aria-hidden
          className="material-symbols-outlined relative text-[72px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          contactless
        </span>
      </div>
      <h1 className="font-display text-display-lg font-bold text-on-surface">
        Insert, tap, or swipe
      </h1>
      <p className="max-w-sm text-body-customer text-on-surface-variant">
        Follow the prompts on the card terminal next to the kiosk.
      </p>
      <div className="mt-2 flex items-center gap-2 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
        <span className="size-2 animate-pulse rounded-full bg-primary" />
        Waiting for terminal
      </div>
    </div>
  );
}

function Approved({
  amountCents,
  currency,
}: {
  amountCents: number;
  currency: string;
}): React.JSX.Element {
  return (
    <div className="flex max-w-md flex-col items-center gap-6">
      <div className="flex size-40 items-center justify-center rounded-full bg-success-container">
        <span
          aria-hidden
          className="material-symbols-outlined text-[72px] text-success"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check
        </span>
      </div>
      <h1 className="font-display text-display-lg font-bold text-on-surface">
        Approved
      </h1>
      <p className="text-body-customer text-on-surface-variant">
        {formatMoney(amountCents, currency)} charged. Sending your order to the
        kitchen…
      </p>
    </div>
  );
}

function Declined({
  reason,
  onRetry,
}: {
  reason: string | null;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className="flex max-w-md flex-col items-center gap-6">
      <div className="flex size-40 items-center justify-center rounded-full bg-error-container">
        <span
          aria-hidden
          className="material-symbols-outlined text-[72px] text-error"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          close
        </span>
      </div>
      <h1 className="font-display text-display-lg font-bold text-on-surface">
        Declined
      </h1>
      <p className="text-body-customer text-on-surface-variant">
        {reason ?? 'Your card was declined at the terminal.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-xl bg-primary px-6 py-3 font-bold text-on-primary shadow-card-soft transition-transform active:scale-95"
        data-testid="kiosk-payment-retry"
      >
        Try another card
      </button>
    </div>
  );
}
