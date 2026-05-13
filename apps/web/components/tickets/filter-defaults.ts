/**
 * Server-safe filter defaults for the tickets history page.
 *
 * Lives outside the `'use client'` modules so that React Server Components
 * (e.g. `app/(app)/[tenantSlug]/[locationSlug]/tickets/page.tsx`) can import
 * the default-derivation helper without dragging client-only code into the
 * server bundle. The matching `TicketsFilterValues` type is mirrored here for
 * the same reason — Next.js 15 forbids server components from reaching into
 * `'use client'` modules for runtime values.
 */

import type { TicketStatus } from '@/lib/graphql/generated/graphql';

export interface TicketsFilterValues {
  /** ISO date (YYYY-MM-DD) — local-day boundary, sent to api as start of day. */
  fromDate: string;
  /** ISO date (YYYY-MM-DD) — local-day boundary, sent to api as end of day. */
  toDate: string;
  /** "ALL" sentinel maps to undefined; otherwise a TicketStatus value. */
  status: 'ALL' | TicketStatus;
  /** "ALL" sentinel maps to undefined; otherwise a server (membership user) id. */
  serverId: 'ALL' | string;
}

/**
 * Default filters: last 7 days, all statuses, all servers. We could scope to
 * "today only" to keep the initial query tight, but that produces an empty
 * state on a fresh demo or for any location that hasn't closed a ticket yet
 * today — a bad first impression. A 7-day window is small enough to keep the
 * query fast and large enough that any active location shows history.
 */
export function defaultFilterValues(now: Date = new Date()): TicketsFilterValues {
  const toIso = now.toISOString().slice(0, 10);
  const fromMs = now.getTime() - 6 * 24 * 60 * 60 * 1000;
  const fromIso = new Date(fromMs).toISOString().slice(0, 10);
  return { fromDate: fromIso, toDate: toIso, status: 'ALL', serverId: 'ALL' };
}
