# F&B Control Pane — Analytics & Guest CRM Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** Build Analytics + Guest CRM — Guest model, live aggregation queries, dashboard/insights/guests UIs, POS+reservation guest pickers.

**Spec:** `docs/superpowers/specs/2026-04-28-fnb-analytics-guest-crm-design.md`

**Patterns to reuse:** all established (Pothos v4, pure-function resolver extraction, Zod schemas, urql, recharts).

---

## Task 1 — Schema additions

Append `Guest` model + relations on Tenant + add `guestId` to Ticket and Reservation. Generate migration `analytics_guest_crm`. Verify Pothos types regenerate, all api tests still green.

Commit: `feat(db): add Guest model with Ticket and Reservation linkage`

## Task 2 — Validation schemas

`packages/validation/src/{guest,analytics}.ts` + tests.

`guest.ts`: `createGuestSchema` (name 1-120, phone optional 1-40, email optional, notes optional 0-500), `updateGuestSchema`, `archiveGuestSchema`, `linkTicketGuestSchema` (ticketId, guestId nullable), `linkReservationGuestSchema`, `searchGuestsSchema` (query 1-120, limit 1-50).

`analytics.ts`: `dateRangeSchema` (from <= to, max 92 days range), `topItemsSortSchema` (`QUANTITY|REVENUE|TICKETS`).

TDD: write failing tests for cross-field rules (date range max span, etc.), RED, implement, GREEN. Add subpath exports `./guest`, `./analytics`. Re-export from `index.ts`.

Commit: `feat(validation): add Zod schemas for guest CRM and analytics`

## Task 3 — Pure helper: date-range resolution

File: `apps/api/src/analytics/date-range.ts` + test.

```ts
import { fromZonedTime } from 'date-fns-tz';

export function resolveBusinessDayRange(args: {
  from: Date;
  to: Date;
  timezone: string;
  businessDayCutoff: string;
}): { fromUtc: Date; toUtc: Date } {
  const [hh, mm] = args.businessDayCutoff.split(':').map(Number);
  const fromYmd = formatDateLike(args.from);
  const toYmd = formatDateLike(addDays(args.to, 1));
  const fromUtc = fromZonedTime(`${fromYmd}T${pad(hh!)}:${pad(mm!)}:00`, args.timezone);
  const toUtc = fromZonedTime(`${toYmd}T${pad(hh!)}:${pad(mm!)}:00`, args.timezone);
  return { fromUtc, toUtc };
}
```

(Helpers for date formatting + addDays are inline, no new deps.)

Tests: business-day cutoff at 04:00 means a ticket closed at 02:00 local on Apr 27 belongs to business-day Apr 26 — verify the `fromUtc/toUtc` boundary covers it. Edge cases: cutoff at 00:00 = calendar day; from == to (single day). RED first.

Commit: `feat(api): add resolveBusinessDayRange helper for analytics windows`

## Task 4 — Pure helpers: aggregation builders

Files: `apps/api/src/analytics/{top-items,hourly-mix,day-of-week-mix,summary,servers,cohort}.ts` + tests for each.

Each helper accepts a flat array of input rows (so the resolver does the Prisma fetch and the helper does the math). Pure functions, no db access.

`top-items.ts`:
```ts
export interface RawLine { menuItemId: string; menuItemName: string; quantity: number; lineSubtotalCents: number; lineDiscountCents: number; ticketId: string; status: 'NEW'|'FIRED'|'READY'|'SERVED'|'VOIDED' }
export function computeTopItems(args: {
  lines: RawLine[];
  limit: number;
  by: 'QUANTITY' | 'REVENUE' | 'TICKETS';
}): Array<{ menuItemId: string; menuItemName: string; quantitySold: number; revenueCents: number; ticketCount: number }> {
  // Filter out VOIDED. Group by menuItemId. Sort by `by`. Slice limit.
}
```

`hourly-mix.ts`: takes tickets `{ closedAt, totalCents }` + timezone, buckets into 24 hours of local time, sums revenue + count.

`day-of-week-mix.ts`: same but bucket by ISO day-of-week 1..7 → enum MON..SUN.

`summary.ts`: per spec section 4.4.

`servers.ts`: per spec section 4.4. Note `voidRate` = voided lines / total lines across this server's tickets.

`cohort.ts`: needs `firstVisitAt` per guest — accept `guestVisits: Array<{ guestId, ticketClosedAt }>` and `range: { from, to }`. New = guests whose earliest visit is within range. Returning = guests with a visit before range AND a visit within range.

TDD: every helper RED first.

Commit: `feat(api): add analytics aggregation helpers (top items, hourly, daily, summary, servers, cohort)`

## Task 5 — TTL cache helper

File: `apps/api/src/cache.ts` + test.

```ts
interface Entry<T> { value: T; expiresAt: number }
const store = new Map<string, Entry<unknown>>();

export async function withTtlCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidateCachePrefix(prefix: string): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

export function clearCache(): void { store.clear(); }
```

Tests: cache hit returns cached, miss invokes fn, expire after ttl, prefix invalidation, parallel calls deduplicate (use a `pendingCalls` map keyed on `key` to avoid duplicate work — implement and test). RED first.

Commit: `feat(api): add per-process TTL cache helper for analytics queries`

## Task 6 — Guest GraphQL type + queries + mutations

Files: `apps/api/src/schema/guest.ts` + `apps/api/src/schema/mutations/guest/{inputs,index,create-guest,update-guest,archive-guest,link-ticket-guest,link-reservation-guest}.ts` + tests.

`Guest` prismaObject exposes scalars + `tickets` (location-scoped to viewer), `reservations`, plus computed:
- `visitCount`: count of CLOSED tickets at viewer's location for this guest.
- `totalSpentCents`: sum of totalCents on those tickets.
- `averageTicketCents`: totalSpent / visitCount (0 if visitCount=0).
- `firstVisitAt`: min(closedAt).
- `upcomingReservation`: next CONFIRMED at viewer location.
- `recentTickets(limit)`: most recent CLOSED tickets at viewer location.

Queries:
- `Query.guests(filter)` (manager): tenant-scoped Guest list.
- `Query.guest(id)` (manager).
- `Query.searchGuests(query, limit)` (staff): typeahead by name+phone, case-insensitive.

Mutations:
- `createGuest`, `updateGuest`, `archiveGuest`: manager.
- `linkTicketGuest`: staff. Verify ticket belongs to viewer's location AND guest belongs to viewer's tenant. Sets `Ticket.guestId`. Updates `Guest.lastSeenAt = MAX(ticket.openedAt, current lastSeenAt)`.
- `linkReservationGuest`: staff. Same pattern.

POS `closeTicket` resolver: extend to also update `Guest.lastSeenAt` if the ticket has a guestId — add this as a small additional side-effect (similar to the floor `completeReservationAfterClose` hook).

Audit codes per spec section 4.6.

Commit: `feat(api): add Guest CRM types, queries, and link mutations`

## Task 7 — Analytics queries

File: `apps/api/src/schema/analytics.ts` + tests. No new mutations.

For each query: build a Prisma fetch matching the input range (using `resolveBusinessDayRange` to compute UTC bounds against the location's timezone+cutoff), pass results to the pure helper. Wrap in `withTtlCache` keyed on `analytics:<locationId>:<queryName>:<from>:<to>:<extras>` with `ttlMs=60_000`.

Queries: `salesSummary`, `topItems`, `hourlyMix`, `dayOfWeekMix`, `serverPerformance`, `guestCohort`. All `manager` scope, location-scoped.

Pure-function-extracted resolvers; tests with mocked Prisma + verify cache hit.

Commit: `feat(api): add Analytics queries (salesSummary, topItems, hourlyMix, dayOfWeekMix, servers, cohort)`

## Task 8 — Integration tests

File: `apps/api/src/test/integration/analytics-guests.test.ts`. Use `setupTestDb` + `truncateAll` (extend to include `guests`).

Seed helper `seedAnalyticsFixtures(prisma, opts)` creates a tenant + location with timezone='America/Los_Angeles' + tax category + a couple of menu items + closed tickets over multiple hours/days with line items + at least one Guest linked to one ticket.

Scenarios:
1. salesSummary aggregates correctly.
2. topItems by QUANTITY/REVENUE/TICKETS each return the expected ordering.
3. hourlyMix buckets by location timezone.
4. dayOfWeekMix buckets correctly.
5. serverPerformance computes voidRate.
6. guestCohort counts new vs returning correctly.
7. searchGuests matches by name + phone case-insensitive.
8. linkTicketGuest updates lastSeenAt + audit.
9. closeTicket post-commit updates Guest.lastSeenAt when guestId is set.
10. Cross-tenant + cross-location isolation across all queries.
11. `withTtlCache` returns same result within window; manual `clearCache()` between assertions.

Commit: `test(api): add Analytics + Guest CRM integration suite`

## Task 9 — Web: Guests list + profile + picker

Files:
- `apps/web/lib/graphql/operations/guests.graphql` — all guest queries + mutations.
- Refresh static SDL + codegen.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/guests/{layout,page,[id]/page}.tsx` — manager scope.
- `apps/web/components/guests/{guests-table,guest-detail,guest-form,guest-picker,new-guest-dialog}.tsx`.

`<GuestsTable>` columns: name, phone, lastSeenAt, visitCount, totalSpent (formatMoney). Search input. "New guest" CTA.
`<GuestDetail>` page: editable form + recent tickets DataTable + upcoming reservation card.
`<GuestPicker>` (reusable): typeahead via `searchGuests`; if no match, shows "Create new guest with name '<query>'" option that opens the new-guest dialog.

Wire `<GuestPicker>` into:
- `apps/web/components/pos/active-ticket-panel.tsx` — add a "Guest" header row that opens the picker.
- `apps/web/components/reservations/new-reservation-dialog.tsx` — add a guest field that opens the picker; submitting links the new reservation.

Commit: `feat(web): add Guest CRM list, profile, picker, and POS/reservation integrations`

## Task 10 — Web: charts + dashboard + insights

Files:
- Add `recharts` dep to `apps/web`.
- `apps/web/lib/graphql/operations/analytics.graphql`.
- `packages/ui/src/patterns/{kpi-card,chart-card,bar-chart,line-chart}.tsx` — small recharts wrappers.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/dashboard/{layout,page}.tsx` — manager scope.
- `apps/web/components/analytics/dashboard-page.tsx` — landing with KPI cards + sparkline + top items.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/insights/{layout,page}.tsx` — manager scope; tabs + redirect to /sales.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/insights/{sales,items,hours,servers,guests}/page.tsx` — one page per tab.
- `apps/web/components/analytics/{insights-nav,date-range-picker,sales-report,items-report,hours-report,servers-report,guests-report}.tsx`.

`<DateRangePicker>` (controlled, default last 7 business days). Each report uses `useQuery` against the relevant analytics query.

Commit: `feat(web): add dashboard, insights tabs, and chart primitives`

## Task 11 — Playwright E2E

Two specs:
- `analytics-flow.spec.ts`: seed via Prisma a couple of CLOSED tickets with line items + a Guest. Sign in as owner. Navigate to `/dashboard` → assert KPI "Net sales today" is non-zero. Navigate to `/insights/items` → assert "Latte" appears in the table top row. Navigate to `/insights/hours` → assert at least one bar visible.
- `guest-crm-flow.spec.ts`: sign in. Navigate to `/guests` → empty list. Click "New guest" → fill Alice + 555-0100 → submit. Open POS, open a new ticket, click "Guest" header → typeahead "Alice" → pick. Close the ticket. Navigate to `/guests/<id>` → visitCount=1, totalSpent matches.

Add `seedAnalyticsFixtures` helper and `closedTicketWithItem` helper to `apps/web/tests/e2e/fixtures/seed.ts`.

Commit: `test(web): add E2E specs for analytics dashboard and guest CRM flow`

---

## Self-review

- Spec sections all mapped to tasks.
- Pure helpers (3, 4, 5) have full TDD code.
- Other tasks are bullet-point per established pattern.
- Names consistent: `resolveBusinessDayRange`, `computeTopItems`, `computeHourlyMix`, `computeSalesSummary`, `computeServerPerformance`, `computeGuestCohort`, `withTtlCache`, `Guest`, `linkTicketGuest`.
