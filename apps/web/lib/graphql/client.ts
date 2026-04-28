import {
  Client,
  cacheExchange,
  fetchExchange,
  mapExchange,
  subscriptionExchange,
  type SubscriptionOperation,
} from 'urql';

export interface ScopeAccessor {
  (): { tenantSlug: string | null; locationId: string | null };
}

/**
 * Yoga exposes subscriptions over the same `/graphql` endpoint via SSE when
 * the request advertises `accept: text/event-stream`. We build a tiny
 * Observable-style subscriber on top of `EventSource` so urql's
 * `subscriptionExchange` can forward subscriptions without pulling in a
 * websocket dependency.
 */
function forwardSubscription(getScope: ScopeAccessor) {
  return (operation: SubscriptionOperation) => ({
    subscribe: (sink: { next: (data: unknown) => void; error: (err: unknown) => void; complete: () => void }) => {
      const scope = getScope();
      const url = new URL('/api/graphql', window.location.origin);
      if (operation.query) url.searchParams.set('query', operation.query);
      if (operation.variables) url.searchParams.set('variables', JSON.stringify(operation.variables));
      if (operation.operationName) url.searchParams.set('operationName', operation.operationName);
      const tenantHeader = scope.tenantSlug ? `&x-tenant-slug=${encodeURIComponent(scope.tenantSlug)}` : '';
      const locationHeader = scope.locationId ? `&x-location-id=${encodeURIComponent(scope.locationId)}` : '';
      // EventSource cannot set custom headers; piggy-back on cookies for auth
      // (the Next proxy forwards them) and let the SSE response stream events.
      const es = new EventSource(`${url.toString()}${tenantHeader}${locationHeader}`, {
        withCredentials: true,
      });
      es.addEventListener('next', (e) => {
        try {
          sink.next(JSON.parse((e as MessageEvent).data));
        } catch (err) {
          sink.error(err);
        }
      });
      es.addEventListener('error', (e) => {
        sink.error(e);
      });
      es.addEventListener('complete', () => {
        sink.complete();
      });
      return {
        unsubscribe: () => {
          es.close();
        },
      };
    },
  });
}

/**
 * Build a urql client that targets the same-origin /api/graphql proxy.
 * Reads the tenant + location scope from `getScope` on every request so the
 * scope can change as the user navigates between tenants/locations.
 */
export function createUrqlClient(getScope: ScopeAccessor): Client {
  return new Client({
    url: '/api/graphql',
    fetchOptions: () => {
      const scope = getScope();
      const headers: Record<string, string> = {};
      if (scope.tenantSlug) headers['x-tenant-slug'] = scope.tenantSlug;
      if (scope.locationId) headers['x-location-id'] = scope.locationId;
      return { headers, credentials: 'same-origin' };
    },
    exchanges: [
      cacheExchange,
      mapExchange({}),
      fetchExchange,
      subscriptionExchange({ forwardSubscription: forwardSubscription(getScope) }),
    ],
    requestPolicy: 'cache-and-network',
  });
}
