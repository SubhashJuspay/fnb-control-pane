'use client';

import { useEffect } from 'react';
import { useQuery, useSubscription } from 'urql';
import { RefreshCw } from 'lucide-react';
import { Button } from '@repo/ui';
import {
  OnlineOrderConfirmStatus,
  OnlineOrderRequestsDocument,
  OnlineOrderRequestsStreamDocument,
  type OnlineOrderRequestsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { OnlineOrderRequestCard } from './online-order-request-card';

export interface OnlineOrdersInboxProps {
  tenantSlug: string;
  locationSlug: string;
  locationName: string;
  canReject: boolean;
}

type Request = NonNullable<OnlineOrderRequestsQuery['onlineOrderRequests']>[number];

export function OnlineOrdersInbox({
  tenantSlug: _tenantSlug,
  locationSlug: _locationSlug,
  locationName,
  canReject,
}: OnlineOrdersInboxProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }, refetch] = useQuery({
    query: OnlineOrderRequestsDocument,
    variables: { filter: null },
    requestPolicy: 'cache-and-network',
  });

  // SSE: refetch the list whenever a new request is created or an existing
  // one changes status. Cheap and avoids cache mutation gymnastics.
  const [subState] = useSubscription({ query: OnlineOrderRequestsStreamDocument });
  useEffect(() => {
    if (subState.data) {
      refetch({ requestPolicy: 'network-only' });
    }
  }, [subState.data, refetch]);

  const onManualRefresh = (): void => {
    refetch({ requestPolicy: 'network-only' });
  };

  // urql's useSubscription stays in `fetching` while the SSE stream is open
  // (it's a long-lived request). Treat that as the healthy state; only flag
  // an error as "disconnected".
  const subscriptionHealthy = !subState.error;

  const requests: Request[] = (data?.onlineOrderRequests ?? []).filter(
    (r): r is Request => r != null,
  );
  const pending = requests.filter((r) => r.confirmStatus === OnlineOrderConfirmStatus.Pending);
  const decided = requests.filter((r) => r.confirmStatus !== OnlineOrderConfirmStatus.Pending);

  return (
    <div
      className="flex flex-col gap-stack-loose p-container-margin"
      data-testid="online-orders-inbox"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-headline-md font-bold text-on-surface">
            Online orders
          </h1>
          <p className="text-body-staff text-on-surface-variant">
            {locationName} ·{' '}
            <span className="font-semibold text-primary">
              {pending.length} pending
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5">
            <span
              className={[
                'inline-flex size-2 rounded-full',
                subscriptionHealthy ? 'animate-pulse bg-success' : 'bg-warning',
              ].join(' ')}
              aria-hidden
              title={
                subscriptionHealthy
                  ? 'Live — new orders appear automatically'
                  : 'Reconnecting to live updates…'
              }
            />
            <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              {subscriptionHealthy ? 'Live' : 'Reconnecting…'}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onManualRefresh}
            disabled={fetching}
            data-testid="online-orders-refresh"
            className="border-primary text-primary hover:bg-primary/5"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${fetching ? 'animate-spin' : ''}`}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </header>
      {error ? (
        <p className="rounded-xl border border-error/30 bg-error-container p-3 text-body-staff text-error-on-container">
          {error.message}
        </p>
      ) : null}
      <section
        className="flex flex-col gap-gutter"
        data-testid="online-orders-pending"
      >
        <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Pending
        </h2>
        {fetching && pending.length === 0 ? (
          <p className="text-body-staff text-on-surface-variant">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="rounded-xl border border-outline-variant bg-surface-container-low p-card-padding text-center text-body-staff text-on-surface-variant">
            No pending requests.
          </p>
        ) : (
          pending.map((r) => (
            <OnlineOrderRequestCard
              key={r.id}
              request={r}
              currency={currency}
              canReject={canReject}
            />
          ))
        )}
      </section>
      {decided.length > 0 ? (
        <section
          className="flex flex-col gap-gutter"
          data-testid="online-orders-decided"
        >
          <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Confirmed / rejected
          </h2>
          {decided.map((r) => (
            <OnlineOrderRequestCard
              key={r.id}
              request={r}
              currency={currency}
              canReject={false}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
