/**
 * Server-side GraphQL fetch helper. Used by server components and server
 * actions to talk to the api directly (bypassing the /api/graphql proxy).
 *
 * - Targets `INTERNAL_API_URL` (defaults to the Docker DNS name `api:4000`).
 * - Sends no cookies — server-to-server, anonymous-allowed operations only,
 *   or with a service token in `headers` when the api supports it.
 * - Disables fetch caching: Next.js otherwise inlines the response into the
 *   route's static prerender, which is wrong for invitation tokens etc.
 */

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:4000/graphql';

export interface ServerFetchResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function serverFetch<T>({
  query,
  variables,
  headers = {},
}: {
  query: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<ServerFetchResult<T>> {
  const response = await fetch(INTERNAL_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!response.ok) {
    return {
      errors: [{ message: `Upstream api returned ${response.status}` }],
    };
  }
  return (await response.json()) as ServerFetchResult<T>;
}
