import {
  Client,
  fetchExchange,
  mapExchange,
  subscriptionExchange,
  type SubscriptionOperation,
} from 'urql';
import { cacheExchange } from '@urql/exchange-graphcache';

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
      // Normalized cache. With per-entity `id` keys, a mutation that returns
      // an updated entity (e.g. fireTicketItem → TicketItem with new status)
      // automatically patches every query in the cache that references that
      // entity — no manual refetch needed. The `updates` resolvers below
      // handle collection-style mutations that ADD or REMOVE rather than
      // update in place.
      cacheExchange({
        // Pothos exposes every domain type with a `String` id field. Falling
        // back to `null` for connection wrappers / payload types disables
        // normalisation for them (urql will still cache them under the
        // parent operation key).
        keys: {
          PageInfo: () => null,
          QueryCatalogItemsConnection: () => null,
          QueryCatalogItemsConnectionEdge: () => null,
          QueryTicketHistoryConnection: () => null,
          QueryTicketHistoryConnectionEdge: () => null,
          TenantMembersConnection: () => null,
          TenantMembersConnectionEdge: () => null,
        },
        updates: {
          Mutation: {
            openTicket(result, _args, cache) {
              const ticket = (result as { openTicket?: { id?: string } | null })
                .openTicket;
              if (!ticket?.id) return;
              // Invalidate every cached openTickets query — urql will refetch
              // them on next read. Cheap, and avoids manually splicing.
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'openTickets')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            closeTicket(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'openTickets' || f.fieldName === 'ticketHistory')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            voidTicket(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'openTickets' || f.fieldName === 'ticketHistory')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            reopenTicket(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'openTickets' || f.fieldName === 'ticketHistory')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            processPayment(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter(
                  (f) =>
                    f.fieldName === 'openTickets' ||
                    f.fieldName === 'ticketHistory' ||
                    f.fieldName === 'currentCashDrawer' ||
                    f.fieldName === 'cashDrawerHistory',
                )
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            // For addTicketItem, the new TicketItem has a new id; we need to
            // splice it into the parent Ticket.items array. Invalidate the
            // ticket(id) query and let urql refetch — simpler than mutating
            // the cached array in place and avoids edge cases with optimistic
            // duplicates.
            addTicketItem(_result, args, cache) {
              const input = (args as { input?: { ticketId?: string } }).input;
              if (input?.ticketId) cache.invalidate({ __typename: 'Ticket', id: input.ticketId });
            },
            voidTicketItem(_result, args, cache) {
              const input = (args as { input?: { ticketItemId?: string } }).input;
              if (input?.ticketItemId)
                cache.invalidate({ __typename: 'TicketItem', id: input.ticketItemId });
            },
            // Cash drawer + tip pool + inventory mutations all change one
            // entity that's already normalised by id — graphcache handles
            // those automatically. The list-style ones below need a nudge.
            openCashDrawer(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'currentCashDrawer')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            closeCashDrawer(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter(
                  (f) => f.fieldName === 'currentCashDrawer' || f.fieldName === 'cashDrawerHistory',
                )
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            recordCashMovement(_result, args, cache) {
              const sid = (args as { sessionId?: string }).sessionId;
              if (sid) cache.invalidate({ __typename: 'CashDrawerSession', id: sid });
            },
            recordStockMovement(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter(
                  (f) => f.fieldName === 'ingredientStocks' || f.fieldName === 'stockMovements',
                )
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            upsertIngredient(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'ingredients')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            upsertVendor(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'vendors')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            upsertTipPoolRule(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'tipPoolRules')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
            archiveTipPoolRule(_result, _args, cache) {
              cache
                .inspectFields('Query')
                .filter((f) => f.fieldName === 'tipPoolRules')
                .forEach((f) => cache.invalidate('Query', f.fieldName, f.arguments));
            },
          },
        },
      }),
      mapExchange({}),
      fetchExchange,
      subscriptionExchange({ forwardSubscription: forwardSubscription(getScope) }),
    ],
    requestPolicy: 'cache-and-network',
  });
}
