'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'urql';
import {
  CheckCircle2,
  ChefHat,
  Flame,
  PartyPopper,
  Printer,
  RefreshCcw,
  ShoppingBag,
  XCircle,
} from 'lucide-react';
import { formatMoney } from '@repo/ui';
import { TrackOnlineOrderDocument } from '@/lib/graphql/generated/graphql';

export interface TrackingPageProps {
  token: string;
  currency: string;
  tenantSlug: string;
  locationSlug: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending — waiting for kitchen confirmation',
  CONFIRMED: 'Confirmed — being prepared',
  REJECTED: 'Rejected',
};

type StepKey = 'RECEIVED' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'PICKED_UP';

const STEPS: { key: StepKey; label: string; Icon: typeof ShoppingBag }[] = [
  { key: 'RECEIVED', label: 'Received', Icon: ShoppingBag },
  { key: 'CONFIRMED', label: 'Confirmed', Icon: ChefHat },
  { key: 'PREPARING', label: 'Preparing', Icon: Flame },
  { key: 'READY', label: 'Ready', Icon: CheckCircle2 },
  { key: 'PICKED_UP', label: 'Picked up', Icon: PartyPopper },
];

function deriveActiveStep({
  confirmStatus,
  isReady,
  isClosed,
}: {
  confirmStatus: string | null | undefined;
  isReady: boolean;
  isClosed: boolean;
}): StepKey {
  if (isClosed) return 'PICKED_UP';
  if (isReady) return 'READY';
  if (confirmStatus === 'CONFIRMED') return 'PREPARING';
  return 'RECEIVED';
}

function stepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key);
}

function formatRelative(seconds: number): string {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  return `${m}m ago`;
}

export function TrackingPage({
  token,
  currency,
  tenantSlug,
  locationSlug,
}: TrackingPageProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: TrackOnlineOrderDocument,
    variables: { token },
    requestPolicy: 'network-only',
  });

  const mountedAt = useRef<number>(Date.now());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  // After checkout, the public `trackOnlineOrder` query can briefly miss the
  // freshly-created row (Neon read-replica lag, urql cache, etc). Suppress the
  // "Order not found" empty state for the first GRACE_MS so the page keeps
  // saying "Looking for your order…" until polling picks it up. Real "not
  // found" cases (bad token, expired link) just take a few seconds longer.
  const GRACE_MS = 20_000;
  const inGracePeriod = now - mountedAt.current < GRACE_MS;

  // Manual polling every 5s — simpler than wiring a subscription for the
  // anonymous tracking surface.
  useEffect(() => {
    const id = window.setInterval(() => {
      refetch({ requestPolicy: 'network-only' });
    }, 5000);
    return () => window.clearInterval(id);
  }, [refetch]);

  // Tick a clock for the "updated Xs ago" indicator.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // When new data arrives, mark when we got it.
  useEffect(() => {
    if (data) setLastUpdatedAt(Date.now());
  }, [data]);

  const tracking = data?.trackOnlineOrder ?? null;
  const status = tracking?.confirmStatus ?? null;
  const isReady = Boolean(tracking?.isReady);
  const isRejected = status === 'REJECTED';
  const isClosed = tracking?.ticketStatus === 'CLOSED';

  return (
    <div className="flex flex-col gap-4" data-testid="tracking-page">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold">
            {tracking?.customerName
              ? `Hi ${tracking.customerName.split(/\s+/)[0]}`
              : 'Order status'}
          </h1>
          {tracking?.shortNumber != null ? (
            <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">
              #{tracking.shortNumber}
            </span>
          ) : null}
        </div>
        <p
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <RefreshCcw
            className={`size-3 ${fetching ? 'animate-spin' : ''}`}
            aria-hidden
          />
          Updated {formatRelative(Math.floor((now - lastUpdatedAt) / 1000))}
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      {!tracking && (fetching || inGracePeriod) ? (
        <div
          className="flex flex-col gap-4"
          aria-busy="true"
          aria-live="polite"
          data-testid="tracking-loading"
        >
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-sm font-medium">Finding your order…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This usually takes a couple of seconds.
            </p>
          </div>
          {/* Skeleton stepper */}
          <div className="grid grid-cols-4 gap-2" role="presentation">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex animate-pulse flex-col items-center gap-1 rounded-lg border bg-card p-2"
              >
                <div className="size-4 rounded-full bg-muted" />
                <div className="h-2 w-12 rounded bg-muted/70" />
              </div>
            ))}
          </div>
          {/* Skeleton info cards */}
          <div className="flex animate-pulse flex-col gap-2 rounded-xl border bg-card p-4">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-4 w-48 rounded bg-muted/70" />
          </div>
          <div className="flex animate-pulse flex-col gap-2 rounded-xl border bg-card p-4">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted/70" />
            <div className="h-3 w-3/4 rounded bg-muted/60" />
            <div className="mt-1 h-4 w-24 rounded bg-muted self-end" />
          </div>
        </div>
      ) : tracking ? (
        <>
          {/* Hidden, machine-readable status used by tests */}
          <span
            className="sr-only"
            data-testid="tracking-status"
            data-status={status ?? ''}
          >
            {status ? STATUS_LABEL[status] ?? status : 'Unknown'}
          </span>

          {isRejected ? (
            <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="size-5 text-destructive" aria-hidden />
                <p className="text-sm font-semibold text-destructive">
                  Order rejected
                </p>
              </div>
              {tracking.rejectReason ? (
                <p className="text-sm text-muted-foreground">
                  Reason: {tracking.rejectReason}
                </p>
              ) : null}
            </div>
          ) : (
            <Stepper
              activeKey={deriveActiveStep({
                confirmStatus: status,
                isReady,
                isClosed,
              })}
            />
          )}

          {!isRejected && isClosed ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <PartyPopper className="size-4 shrink-0" aria-hidden />
              <span>Order complete — thanks for stopping by!</span>
            </div>
          ) : !isRejected && isReady ? (
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm font-semibold text-primary">
              Your order is ready for pickup!
            </div>
          ) : null}

          <section className="flex flex-col gap-1 rounded-xl border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Items
            </p>
            <p className="text-sm" data-testid="tracking-item-summary">
              {tracking.itemSummary ?? '—'}
            </p>
          </section>

          <section className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-sm">
            {tracking.subtotalCents != null ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {formatMoney(tracking.subtotalCents, currency)}
                </span>
              </div>
            ) : null}
            {tracking.taxCents != null && tracking.taxCents > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">
                  {formatMoney(tracking.taxCents, currency)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t pt-1.5 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {tracking.totalCents != null
                  ? formatMoney(tracking.totalCents, currency)
                  : '—'}
              </span>
            </div>
          </section>

          <Link
            href={`/order/${tenantSlug}/${locationSlug}/receipt/${token}`}
            className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent/40"
            data-testid="tracking-receipt-link"
          >
            <Printer className="size-4" aria-hidden />
            View / print receipt
          </Link>
        </>
      ) : (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border bg-muted/30 p-6 text-center"
          data-testid="tracking-not-found"
        >
          <p className="text-sm font-medium">Order not found</p>
          <p className="text-xs text-muted-foreground">
            We couldn&apos;t find that order. The tracking link may have expired.
          </p>
        </div>
      )}
    </div>
  );
}

function Stepper({ activeKey }: { activeKey: StepKey }): React.JSX.Element {
  const activeIdx = stepIndex(activeKey);
  return (
    <ol
      className="flex items-stretch gap-2"
      role="list"
      aria-label="Order progress"
      data-testid="tracking-stepper"
      data-step={activeKey}
    >
      {STEPS.map((step, idx) => {
        const reached = idx <= activeIdx;
        const isCurrent = idx === activeIdx;
        const Icon = step.Icon;
        return (
          <li
            key={step.key}
            className={[
              'flex flex-1 flex-col items-center gap-1 rounded-lg border p-2',
              reached ? 'bg-primary/10 text-primary border-primary/40' : 'bg-card text-muted-foreground',
              isCurrent ? 'shadow-sm ring-1 ring-primary/40' : '',
            ].join(' ')}
          >
            <Icon className="size-4" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
