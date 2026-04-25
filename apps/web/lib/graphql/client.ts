import { Client, cacheExchange, fetchExchange, mapExchange } from 'urql';

export interface ScopeAccessor {
  (): { tenantSlug: string | null; locationId: string | null };
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
    exchanges: [cacheExchange, mapExchange({}), fetchExchange],
    requestPolicy: 'cache-and-network',
  });
}
