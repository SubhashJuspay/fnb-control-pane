'use client';

import { useEffect } from 'react';
import { useQuery, useSubscription } from 'urql';
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

  const requests: Request[] = (data?.onlineOrderRequests ?? []).filter(
    (r): r is Request => r != null,
  );
  const pending = requests.filter((r) => r.confirmStatus === OnlineOrderConfirmStatus.Pending);
  const decided = requests.filter((r) => r.confirmStatus !== OnlineOrderConfirmStatus.Pending);

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="online-orders-inbox">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Online Orders</h1>
        <p className="text-xs text-muted-foreground">
          {locationName} • {pending.length} pending
        </p>
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
