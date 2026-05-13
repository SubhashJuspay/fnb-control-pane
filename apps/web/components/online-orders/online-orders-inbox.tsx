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
    <div className="flex flex-col gap-4 p-4" data-testid="online-orders-inbox">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Online Orders</h1>
          <p className="text-xs text-muted-foreground">
            {locationName} • {pending.length} pending
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={[
              'inline-flex size-2 rounded-full',
              subscriptionHealthy ? 'bg-emerald-500' : 'bg-amber-500',
            ].join(' ')}
            aria-hidden
            title={
              subscriptionHealthy
                ? 'Live — new orders appear automatically'
                : 'Reconnecting to live updates…'
            }
          />
          <span>{subscriptionHealthy ? 'Live' : 'Reconnecting…'}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onManualRefresh}
            disabled={fetching}
            data-testid="online-orders-refresh"
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
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <section className="flex flex-col gap-3" data-testid="online-orders-pending">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pending
        </h2>
        {fetching && pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
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
        <section className="flex flex-col gap-3" data-testid="online-orders-decided">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
