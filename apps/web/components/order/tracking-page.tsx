'use client';

import { useEffect } from 'react';
import { useQuery } from 'urql';
import { formatMoney } from '@repo/ui';
import { TrackOnlineOrderDocument } from '@/lib/graphql/generated/graphql';

export interface TrackingPageProps {
  token: string;
  currency: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending — waiting for kitchen confirmation',
  CONFIRMED: 'Confirmed — being prepared',
  REJECTED: 'Rejected',
};

export function TrackingPage({ token, currency }: TrackingPageProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: TrackOnlineOrderDocument,
    variables: { token },
    requestPolicy: 'network-only',
  });

  // Manual polling every 5s — simpler than wiring a subscription for the
  // anonymous tracking surface.
  useEffect(() => {
    const id = window.setInterval(() => {
      refetch({ requestPolicy: 'network-only' });
    }, 5000);
    return () => window.clearInterval(id);
  }, [refetch]);

  const tracking = data?.trackOnlineOrder ?? null;
  const status = tracking?.confirmStatus ?? null;
  const isReady = Boolean(tracking?.isReady);

  return (
    <div className="flex flex-col gap-4" data-testid="tracking-page">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Order status</h1>
        {tracking?.shortNumber != null ? (
          <p className="text-sm text-muted-foreground">
            Order #{tracking.shortNumber}
          </p>
        ) : null}
      </header>
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {fetching && !tracking ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tracking ? (
        <div className="flex flex-col gap-3">
          <div
            className="rounded-md border bg-card p-4"
            data-testid="tracking-status"
            data-status={status ?? ''}
          >
            <p className="text-sm font-medium">
              {status ? STATUS_LABEL[status] ?? status : 'Unknown'}
            </p>
            {isReady ? (
              <p className="mt-1 text-sm font-semibold text-primary">
                Your order is ready for pickup!
              </p>
            ) : null}
            {status === 'REJECTED' && tracking.rejectReason ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Reason: {tracking.rejectReason}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Items
            </p>
            <p
              className="mt-1 text-sm"
              data-testid="tracking-item-summary"
            >
              {tracking.itemSummary ?? '—'}
            </p>
          </div>
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Total</span>
              <span className="font-semibold tabular-nums">
                {tracking.totalCents != null
                  ? formatMoney(tracking.totalCents, currency)
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          We couldn&apos;t find that order. The tracking link may have expired.
        </p>
      )}
    </div>
  );
}
