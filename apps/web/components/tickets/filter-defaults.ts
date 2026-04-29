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
 * Default filters: today, all statuses, all servers. The defaults are also
 * derived for the URL-less initial render so that the very first query
 * scopes to today's history rather than dumping every ticket ever closed.
 */
export function defaultFilterValues(now: Date = new Date()): TicketsFilterValues {
  const iso = now.toISOString().slice(0, 10);
  return { fromDate: iso, toDate: iso, status: 'ALL', serverId: 'ALL' };
}
