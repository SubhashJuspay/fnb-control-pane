'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'urql';
import { formatMoney } from '@repo/ui';
import { TrackOnlineOrderDocument } from '@/lib/graphql/generated/graphql';
import { useCart } from './cart-state';

export interface TrackingPageProps {
  token: string;
  currency: string;
  tenantSlug: string;
  locationSlug: string;
  tableSlug?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending — waiting for kitchen confirmation',
  CONFIRMED: 'Confirmed — being prepared',
  REJECTED: 'Rejected',
};

type StepKey = 'RECEIVED' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'PICKED_UP';

const STEPS: { key: StepKey; label: string; icon: string }[] = [
  { key: 'RECEIVED', label: 'Received', icon: 'shopping_bag' },
  { key: 'CONFIRMED', label: 'Confirmed', icon: 'check' },
  { key: 'PREPARING', label: 'Preparing', icon: 'cooking' },
  { key: 'READY', label: 'Ready', icon: 'notifications_active' },
  { key: 'PICKED_UP', label: 'Picked up', icon: 'celebration' },
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
  tableSlug = null,
}: TrackingPageProps): React.JSX.Element {
  // Preserve the dine-in table the customer originally scanned. Without
  // this, "Back to menu" drops them onto the generic location landing
  // page and the next order would not be tied to their table.
  const menuHref = tableSlug
    ? `/order/${tenantSlug}/${locationSlug}?table=${encodeURIComponent(tableSlug)}`
    : `/order/${tenantSlug}/${locationSlug}`;
  const [{ data, fetching, error }, refetch] = useQuery({
    query: TrackOnlineOrderDocument,
    variables: { token },
    requestPolicy: 'network-only',
  });

  const mountedAt = useRef<number>(Date.now());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  const GRACE_MS = 20_000;
  const inGracePeriod = now - mountedAt.current < GRACE_MS;

  useEffect(() => {
    const id = window.setInterval(() => {
      refetch({ requestPolicy: 'network-only' });
    }, 5000);
    return () => window.clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (data) setLastUpdatedAt(Date.now());
  }, [data]);

  const tracking = data?.trackOnlineOrder ?? null;
  const status = tracking?.confirmStatus ?? null;
  const isReady = Boolean(tracking?.isReady);
  const isRejected = status === 'REJECTED';
  const isClosed = tracking?.ticketStatus === 'CLOSED';

  // When the table tab settles (ticket closed or rejected), drop the
  // localStorage memory for the table so the next customer at this table
  // starts a fresh tab — name/phone form re-shown, no "open tab" banner.
  // Runs once per terminal state transition; further re-renders are
  // no-ops because `forgetTableTab` is stable per (tenant, location,
  // table) and the underlying key is idempotent.
  const { forgetTableTab } = useCart();
  useEffect(() => {
    if (!tableSlug) return;
    if (isClosed || isRejected) {
      forgetTableTab();
    }
  }, [tableSlug, isClosed, isRejected, forgetTableTab]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-gutter" data-testid="tracking-page">
      <header className="flex flex-col items-start justify-between gap-3 py-2 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-headline-md font-bold text-on-surface">
            {tracking?.customerName
              ? `Hi ${tracking.customerName.split(/\s+/)[0]}`
              : 'Order status'}
          </h1>
          {tracking?.shortNumber != null ? (
            <span
              className="rounded-full bg-secondary-container px-2 py-1 font-status-pill text-status-pill uppercase tracking-wider text-secondary-on-container"
              data-testid="tracking-short-number"
            >
              #{tracking.shortNumber}
            </span>
          ) : null}
        </div>
        <p
          className="flex items-center gap-2 text-on-surface-variant"
          aria-live="polite"
        >
          <span
            aria-hidden
            className={[
              'material-symbols-outlined text-[18px]',
              fetching ? 'animate-spin' : '',
            ].join(' ')}
          >
            sync
          </span>
          <span className="text-body-staff">
            Updated {formatRelative(Math.floor((now - lastUpdatedAt) / 1000))}
          </span>
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-error/30 bg-error-container p-3 text-body-staff text-error-on-container">
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
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding text-center shadow-card-soft">
            <p className="text-body-customer font-semibold text-on-surface">
              Finding your order…
            </p>
            <p className="mt-1 text-body-staff text-on-surface-variant">
              This usually takes a couple of seconds.
            </p>
          </div>
        </div>
      ) : tracking ? (
        <>
          <span
            className="sr-only"
            data-testid="tracking-status"
            data-status={status ?? ''}
          >
            {status ? (STATUS_LABEL[status] ?? status) : 'Unknown'}
          </span>

          {isRejected ? (
            <div className="flex flex-col gap-2 rounded-xl border border-error/40 bg-error-container p-card-padding text-error-on-container">
              <div className="flex items-center gap-2">
                <span aria-hidden className="material-symbols-outlined">
                  cancel
                </span>
                <p className="text-body-customer font-semibold">Order rejected</p>
              </div>
              {tracking.rejectReason ? (
                <p className="text-body-staff">Reason: {tracking.rejectReason}</p>
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
            <div className="flex items-center gap-3 rounded-xl bg-success-container p-card-padding text-success-on-container shadow-sm">
              <div className="rounded-lg bg-success p-2 text-on-success">
                <span aria-hidden className="material-symbols-outlined">
                  celebration
                </span>
              </div>
              <div>
                <h2 className="font-display text-[18px] font-bold">
                  Order complete — thanks for stopping by!
                </h2>
                <p className="text-body-staff opacity-90">
                  Hope to see you again soon.
                </p>
              </div>
            </div>
          ) : !isRejected && isReady ? (
            <div className="flex items-center gap-3 rounded-xl bg-primary-fixed p-card-padding text-on-primary-fixed-variant shadow-sm">
              <div className="rounded-lg bg-primary-container p-2 text-on-primary">
                <span aria-hidden className="material-symbols-outlined">
                  notifications_active
                </span>
              </div>
              <div>
                <h2 className="font-display text-[18px] font-bold">
                  Your order is ready for pickup!
                </h2>
                <p className="text-body-staff opacity-90">
                  Head over to the counter when you can.
                </p>
              </div>
            </div>
          ) : !isRejected && status === 'CONFIRMED' ? (
            <div className="flex items-center gap-3 rounded-xl bg-primary-fixed p-card-padding text-on-primary-fixed-variant shadow-sm">
              <div className="rounded-lg bg-primary-container p-2 text-on-primary">
                <span aria-hidden className="material-symbols-outlined">
                  restaurant
                </span>
              </div>
              <div>
                <h2 className="font-display text-[18px] font-bold">
                  Your order is being prepared
                </h2>
                <p className="text-body-staff opacity-90">
                  The kitchen has confirmed and is cooking now.
                </p>
              </div>
            </div>
          ) : !isRejected ? (
            <div className="flex items-center gap-3 rounded-xl bg-secondary-container p-card-padding text-secondary-on-container shadow-sm">
              <div className="rounded-lg bg-secondary p-2 text-on-secondary">
                <span aria-hidden className="material-symbols-outlined">
                  hourglass_top
                </span>
              </div>
              <div>
                <h2 className="font-display text-[18px] font-bold">
                  Waiting on kitchen confirmation
                </h2>
                <p className="text-body-staff opacity-90">
                  Usually within a couple of minutes.
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
            <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft md:col-span-2">
              <div className="border-b border-outline-variant bg-surface-container-lowest px-card-padding py-3">
                <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Order summary
                </h3>
              </div>
              <div
                className="space-y-3 p-card-padding"
                data-testid="tracking-item-summary"
              >
                <p className="text-body-customer text-on-surface">
                  {tracking.itemSummary ?? '—'}
                </p>
              </div>
            </section>

            <section className="h-fit overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft">
              <div className="border-b border-outline-variant bg-surface-container-lowest px-card-padding py-3">
                <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Payment details
                </h3>
              </div>
              <div className="space-y-3 p-card-padding">
                {tracking.subtotalCents != null ? (
                  <div className="flex justify-between text-body-staff text-on-surface-variant">
                    <span>Subtotal</span>
                    <span className="tabular-nums">
                      {formatMoney(tracking.subtotalCents, currency)}
                    </span>
                  </div>
                ) : null}
                {tracking.taxCents != null && tracking.taxCents > 0 ? (
                  <div className="flex justify-between text-body-staff text-on-surface-variant">
                    <span>Tax</span>
                    <span className="tabular-nums">
                      {formatMoney(tracking.taxCents, currency)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-outline-variant pt-3">
                  <span className="text-body-customer font-bold text-on-surface">
                    Total
                  </span>
                  <span className="font-display text-headline-md font-bold tabular-nums text-primary">
                    {tracking.totalCents != null
                      ? formatMoney(tracking.totalCents, currency)
                      : '—'}
                  </span>
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col items-center gap-6 py-8">
            <Link
              href={`/order/${tenantSlug}/${locationSlug}/receipt/${token}`}
              data-testid="tracking-receipt-link"
              className="group inline-flex items-center justify-center gap-2 rounded-lg border-2 border-primary px-10 py-3 font-bold text-primary transition-colors hover:bg-primary-fixed md:w-auto"
            >
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
              View / print receipt
            </Link>
            <p className="max-w-sm text-center text-body-staff text-on-surface-variant">
              Need help with your order?{' '}
              <Link
                href={menuHref}
                className="font-bold text-primary underline decoration-2 underline-offset-4 hover:text-on-primary-fixed-variant"
              >
                Back to menu
              </Link>
            </p>
          </div>
        </>
      ) : (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-6 text-center"
          data-testid="tracking-not-found"
        >
          <p className="text-body-customer font-semibold text-on-surface">
            Order not found
          </p>
          <p className="text-body-staff text-on-surface-variant">
            We couldn&apos;t find that order. The tracking link may have expired.
          </p>
        </div>
      )}
    </div>
  );
}

function Stepper({ activeKey }: { activeKey: StepKey }): React.JSX.Element {
  const activeIdx = stepIndex(activeKey);
  const progressPct = activeIdx === 0 ? 0 : (activeIdx / (STEPS.length - 1)) * 100;
  return (
    <div
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
      data-testid="tracking-stepper"
      data-step={activeKey}
    >
      <div
        role="list"
        aria-label="Order progress"
        className="relative flex w-full items-start justify-between"
      >
        <div
          aria-hidden
          className="absolute left-0 top-5 -z-0 h-1 w-full bg-surface-container-highest"
        />
        <div
          aria-hidden
          className="absolute left-0 top-5 -z-0 h-1 bg-primary-container transition-all"
          style={{ width: `${progressPct}%` }}
        />
        {STEPS.map((step, idx) => {
          const reached = idx <= activeIdx;
          const isCurrent = idx === activeIdx;
          return (
            <div
              key={step.key}
              role="listitem"
              className="relative z-10 flex flex-1 flex-col items-center gap-3 px-1"
            >
              <div
                className={[
                  'flex size-10 items-center justify-center rounded-full',
                  reached
                    ? 'bg-primary-container text-on-primary'
                    : 'bg-surface-container-highest text-outline',
                  isCurrent ? 'ring-4 ring-primary-fixed' : '',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className="material-symbols-outlined text-[20px]"
                  style={isCurrent ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {reached && !isCurrent ? 'check' : step.icon}
                </span>
              </div>
              <span
                className={[
                  'text-center font-label-caps text-label-caps uppercase tracking-wider',
                  reached ? 'text-primary' : 'text-on-surface-variant',
                  isCurrent ? 'font-bold' : '',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
