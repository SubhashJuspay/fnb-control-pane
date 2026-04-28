'use client';

import { Client, cacheExchange, fetchExchange, mapExchange } from 'urql';

/**
 * Anonymous urql client for the public order surface.
 *
 * Critical: this client does NOT set `x-tenant-slug` / `x-location-id`
 * headers and does NOT send credentials, because the public endpoints are
 * resolved server-side from the URL slugs and must work for unauthenticated
 * customers (Order surface, tracking pages, public menu lookup).
 */
export function createPublicUrqlClient(): Client {
  return new Client({
    url: '/api/graphql',
    fetchOptions: () => ({
      headers: { 'content-type': 'application/json' },
      credentials: 'omit',
    }),
    exchanges: [cacheExchange, mapExchange({}), fetchExchange],
    requestPolicy: 'cache-and-network',
  });
}
