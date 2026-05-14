/**
 * Server-side GraphQL fetch helper. Used by server components and server
 * actions to talk to the api directly (bypassing the /api/graphql proxy).
 *
 * - Targets `INTERNAL_API_URL` (defaults to the Docker DNS name `api:4000`).
 * - Sends no cookies — server-to-server, anonymous-allowed operations only,
 *   or with a service token in `headers` when the api supports it.
 * - Disables fetch caching: Next.js otherwise inlines the response into the
 *   route's static prerender, which is wrong for invitation tokens etc.
 * - Retries on transient upstream failures (network errors, 502/503/504).
 *   The api runs on Render's free tier which sleeps after 15 min idle; the
 *   first request after a quiet period waits 30-60s for the instance to wake
 *   and may return a 5xx during boot. Retrying with backoff lets the cold
 *   start ride out instead of triggering `notFound()` on the calling page.
 */

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:4000/graphql';

// Retry budget: 1s, 2s, 4s, 8s, 16s → ~31s of patience for a cold start before
// we surface an error. Render free-tier cold start is typically 30-60s, so
// covers the common case without making the page hang forever.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

const TRANSIENT_STATUSES = new Set([502, 503, 504, 522, 524]);

export interface ServerFetchResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const body = JSON.stringify({ query, variables });
  let attempt = 0;
  // attempt 0 is the first try; entries in RETRY_DELAYS_MS are the wait
  // before each retry. Total attempts = RETRY_DELAYS_MS.length + 1.
  while (true) {
    try {
      const response = await fetch(INTERNAL_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
        cache: 'no-store',
      });
      if (response.ok) {
        return (await response.json()) as ServerFetchResult<T>;
      }
      if (TRANSIENT_STATUSES.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) await sleep(delay);
        attempt += 1;
        continue;
      }
      return { errors: [{ message: `Upstream api returned ${response.status}` }] };
    } catch (err) {
      // Network-level failures (DNS, ECONNRESET, fetch abort): retry too.
      if (attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) await sleep(delay);
        attempt += 1;
        continue;
      }
      const message = err instanceof Error ? err.message : 'Upstream api fetch failed';
      return { errors: [{ message }] };
    }
  }
}
