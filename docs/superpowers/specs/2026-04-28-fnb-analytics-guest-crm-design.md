# F&B Control Pane — Analytics & Guest CRM Sub-Project Design

**Date:** 2026-04-28
**Status:** Approved (blanket approval; ready for planning)
**Sub-project:** 6 of 7 — Analytics & Guest CRM
**Depends on:** Foundation (0), Menu & Catalog (1), POS (2a), Floor (3).

---

## 1. Project context

### 1.1 What this owns

Two related areas:

**Analytics**: live aggregation queries over POS Tickets + line items computing top dishes, hour-of-day mix, day-of-week patterns, sales summary, server performance, discount/void rates. No materialized views in v1 — direct aggregation against existing tables, cached at the GraphQL layer for ~60s.

**Guest CRM**: a `Guest` table (per tenant) linked optionally to Tickets and Reservations. Visit history, total spend, repeat-visit cohort. Picker UIs for POS active ticket and New Reservation dialog.

### 1.2 Locked decisions

| Decision | Choice |
|---|---|
| Materialization | None in v1. Live aggregation. |
| Caching | None at the api layer; rely on urql client cache + lightweight 60s TTL on heavy queries via a Map cache keyed on (locationId, query, args). |
| Guest model | Per-tenant `Guest` with name, phone (optional, indexed), email (optional), notes, dateAdded, lastSeenAt (denormalized) |
| Guest linkage | Add nullable `guestId` to `Ticket` and `Reservation` (additive only) |
| Dedup | When creating a Reservation/Guest with a phone match, suggest existing — UI-only; backend doesn't auto-merge |
| Loyalty / promotions / SMS | Out of scope |
| Cross-location rollups | Out of scope |
| Predictive / ML | Out of scope |
| Real-time analytics | Out of scope (queries are read-only, not subscription-driven) |
| Date range default | Last 7 days, location timezone |
| Time grouping | Hour-of-day (24 buckets) and Day-of-week (7 buckets) |
| Currency | All figures in `Location.currency` |

### 1.3 RBAC

| Operation | Scope |
|---|---|
| View dashboard / insights | `manager` |
| View guest list, guest profile | `manager` |
| Edit guest (name/phone/notes) | `manager` |
| Pick guest on a ticket / reservation | `staff` |
| Add new guest from picker | `staff` |
| Merge guests | `admin` (deferred to a follow-up — out of scope) |

---

## 2. Architecture

Purely additive.

```
packages/db/prisma/schema.prisma                   ← additions (Guest model + Ticket.guestId + Reservation.guestId)
packages/validation/src/guest.ts                   ← new
packages/validation/src/analytics.ts               ← new (date-range and filter inputs)

apps/api/src/analytics/                            ← pure aggregation builders
  ├─ date-range.ts     (resolveBusinessDayRange — uses Location.timezone + businessDayCutoff)
  ├─ top-items.ts      (computeTopItems)
  ├─ hourly-mix.ts     (computeHourlyMix)
  ├─ summary.ts        (computeSalesSummary)
  ├─ servers.ts        (computeServerPerformance)
apps/api/src/cache.ts                              ← simple per-process TTL cache wrapper
apps/api/src/schema/guest.ts                       ← Guest type + queries
apps/api/src/schema/analytics.ts                   ← analytics queries (no mutations)
apps/api/src/schema/mutations/guest/               ← create/update/delete guest, link/unlink to ticket/reservation
apps/api/src/test/integration/analytics-guests.test.ts

apps/web/app/(app)/[tenantSlug]/[locationSlug]/dashboard/        ← landing page
apps/web/app/(app)/[tenantSlug]/[locationSlug]/insights/         ← report pages
apps/web/app/(app)/[tenantSlug]/[locationSlug]/guests/           ← guest list + profile
apps/web/components/analytics/                                    ← chart primitives + report views
apps/web/components/guests/                                       ← list, profile, picker, drawer
apps/web/lib/graphql/operations/analytics.graphql
apps/web/lib/graphql/operations/guests.graphql
```

POS integration:
- `apps/web/components/pos/active-ticket-panel.tsx` — add a "Guest" line in the header showing linked guest name; click → opens `<GuestPicker>` to link/unlink.

Floor integration:
- `apps/web/components/reservations/new-reservation-dialog.tsx` — add a "Guest" autocomplete that searches guests by name/phone and suggests creating a new one.

Both API additions: `Mutation.linkTicketGuest(ticketId, guestId | null)` and the existing `createReservation` accepts an optional `guestId`.

---

## 3. Data model

```prisma
model Guest {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  name         String
  phone        String?
  email        String?
  notes        String?
  lastSeenAt   DateTime? @map("last_seen_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  tenant       Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  tickets      Ticket[]
  reservations Reservation[]

  @@index([tenantId, name])
  @@index([tenantId, phone])
  @@map("guests")
}
```

Foundation-side:
- On `Tenant`: `guests Guest[]`.
- On `Ticket`: add `guestId String? @map("guest_id") @db.Uuid` + `guest Guest? @relation(...)`.
- On `Reservation`: add `guestId String? @map("guest_id") @db.Uuid` + `guest Guest? @relation(...)`.

Indexes for analytics throughput:
- `Ticket.@@index([locationId, status, closedAt])` — already covered by existing `[locationId, status]` + `[locationId, openedAt]`. Add `[locationId, closedAt]` for the date-range scans on closed tickets.
- `TicketItem.@@index([ticketId, status])` — already exists.

`Guest.lastSeenAt` is denormalized — updated by the `linkTicketGuest` mutation and by `closeTicket` (when a guest is linked, set `lastSeenAt = ticket.closedAt`).

---

## 4. GraphQL surface

### 4.1 Object types

```graphql
type Guest {
  id: UUID!
  name: String!
  phone: String
  email: String
  notes: String
  lastSeenAt: DateTime
  createdAt: DateTime!

  # Computed (analytics over guest's tickets at viewer's location)
  visitCount: Int!
  totalSpentCents: Int!
  averageTicketCents: Int!
  firstVisitAt: DateTime
  upcomingReservation: Reservation
  recentTickets(limit: Int = 10): [Ticket!]!
}

type SalesSummary {
  fromDate: Date!
  toDate: Date!
  ticketCount: Int!
  closedTicketCount: Int!
  voidedTicketCount: Int!
  grossSalesCents: Int!         # sum of subtotalCents of closed tickets
  discountCents: Int!
  taxCents: Int!
  netSalesCents: Int!           # totalCents
  averageTicketCents: Int!
  uniqueGuests: Int!
}

type TopItem {
  menuItem: MenuItem!
  quantitySold: Int!
  revenueCents: Int!
  ticketCount: Int!
}

type HourlyBucket {
  hour: Int!                     # 0..23, in location timezone
  ticketCount: Int!
  revenueCents: Int!
}

type DayOfWeekBucket {
  dayOfWeek: DayOfWeek!
  ticketCount: Int!
  revenueCents: Int!
}

type ServerPerformance {
  user: User!
  ticketCount: Int!
  itemsServed: Int!              # count of TicketItems with this user as servedBy
  revenueCents: Int!
  averageTicketCents: Int!
  voidRate: Float!               # voided line count / total line count
}

type GuestCohort {
  fromDate: Date!
  toDate: Date!
  newGuestCount: Int!            # guests whose first visit is in this range
  returningGuestCount: Int!      # guests with prior visits, who visited again in range
  repeatRate: Float!             # returning / (new + returning)
}
```

### 4.2 Queries

All `manager` scope, location-scoped. All accept an optional `dateRange: DateRangeInput!` (default: last 7 business days at viewer location).

```graphql
extend type Query {
  # Guest CRM
  guests(filter: GuestsFilter): [Guest!]!
  guest(id: UUID!): Guest
  searchGuests(query: String!, limit: Int = 10): [Guest!]!  # for picker; staff scope

  # Analytics
  salesSummary(dateRange: DateRangeInput!): SalesSummary!
  topItems(dateRange: DateRangeInput!, limit: Int = 10, by: TopItemsSort = QUANTITY): [TopItem!]!
  hourlyMix(dateRange: DateRangeInput!): [HourlyBucket!]!
  dayOfWeekMix(dateRange: DateRangeInput!): [DayOfWeekBucket!]!
  serverPerformance(dateRange: DateRangeInput!): [ServerPerformance!]!
  guestCohort(dateRange: DateRangeInput!): GuestCohort!
}

input DateRangeInput { from: Date! to: Date! }
input GuestsFilter { search: String archivedOnly: Boolean = false }
enum TopItemsSort { QUANTITY  REVENUE  TICKETS }
```

### 4.3 Mutations (Guest CRM only)

```graphql
extend type Mutation {
  createGuest(input: CreateGuestInput!): Guest!
  updateGuest(input: UpdateGuestInput!): Guest!
  archiveGuest(input: ArchiveGuestInput!): Guest!  # soft delete; sets lastSeenAt = null

  linkTicketGuest(input: LinkTicketGuestInput!): Ticket!
  linkReservationGuest(input: LinkReservationGuestInput!): Reservation!
}
```

`linkTicketGuest`: staff scope. Sets `Ticket.guestId`. Updates `Guest.lastSeenAt = MAX(ticket.openedAt, current lastSeenAt)`.

### 4.4 Pure helpers (testable aggregation logic)

```ts
// apps/api/src/analytics/date-range.ts
export function resolveBusinessDayRange(args: {
  from: Date;          // local-day boundary (00:00 of from)
  to: Date;            // exclusive end (00:00 of to+1)
  timezone: string;
  businessDayCutoff: string;   // "04:00"
}): { fromUtc: Date; toUtc: Date };

// apps/api/src/analytics/top-items.ts
export interface RawLine { menuItemId: string; menuItemName: string; quantity: number; lineSubtotalCents: number; lineDiscountCents: number; ticketId: string; status: TicketItemStatus }
export function computeTopItems(args: { lines: RawLine[]; limit: number; by: 'QUANTITY' | 'REVENUE' | 'TICKETS' }): Array<{ menuItemId: string; menuItemName: string; quantitySold: number; revenueCents: number; ticketCount: number }>;

// apps/api/src/analytics/hourly-mix.ts
export function computeHourlyMix(args: { tickets: Array<{ closedAt: Date | null; totalCents: number }>; timezone: string }): Array<{ hour: number; ticketCount: number; revenueCents: number }>;

// apps/api/src/analytics/summary.ts
export function computeSalesSummary(args: { tickets: Array<{ status: TicketStatus; subtotalCents: number; discountCents: number; taxCents: number; totalCents: number; guestId: string | null }>; }): { ticketCount: number; closedTicketCount: number; voidedTicketCount: number; grossSalesCents: number; discountCents: number; taxCents: number; netSalesCents: number; averageTicketCents: number; uniqueGuests: number };

// apps/api/src/analytics/servers.ts
export function computeServerPerformance(args: { tickets: Array<{ openedById: string; openedByName: string; totalCents: number; status: TicketStatus; items: Array<{ status: TicketItemStatus; servedById: string | null }> }>; }): Array<ServerPerfRow>;
```

Each helper has full unit tests for the aggregation math.

### 4.5 TTL cache

`apps/api/src/cache.ts`:

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
```

Used inside heavy resolvers (top items, server performance) keyed on `(locationId, query, fromDate, toDate)` with `ttlMs=60_000`. Invalidated by mutations that change tickets — best-effort, not strict consistency.

### 4.6 Audit codes

```
guest.created / updated / archived
ticket.guest_linked / ticket.guest_unlinked
reservation.guest_linked
```

---

## 5. UI shape

### 5.1 Dashboard — `/<location>/dashboard`
Landing page for managers. Top: large KPI cards — Today net sales, Tickets, Average ticket, Unique guests. Below: hourly mix sparkline (last 7 days), top 5 items today.

### 5.2 Insights — `/<location>/insights/*`
Tabbed sub-shell: Sales / Items / Hours / Servers / Guests.
- Sales: `<DateRangePicker>` + summary KPI cards + day-by-day stacked bar chart.
- Items: `TopItemsTable` (sortable by Quantity / Revenue / Tickets); cell-rendered as small bar chart.
- Hours: 24-bar chart of revenue + ticket count by hour.
- Servers: leaderboard with per-server bars.
- Guests: cohort summary card + list of new guests in range.

### 5.3 Guests — `/<location>/guests`
- List: `DataTable<Guest>` columns: name, phone, lastSeenAt, visitCount, totalSpent. Search input. "New guest" CTA.
- Profile: `/<location>/guests/[id]` — guest detail card with editable form; right column = Recent visits (DataTable<Ticket> linked) and Upcoming reservation.

### 5.4 Pickers
- `<GuestPicker>` component: typeahead by name/phone (`searchGuests`); option "Create new guest with name '<query>'" if no match. Used in active ticket panel and new reservation dialog.

### 5.5 Charts
Use **`recharts`** as the chart library — small bundle, idiomatic React, sufficient for our needs. Add as a dependency to `@app/web`.

Chart primitives in `@repo/ui/patterns/`:
- `<KpiCard label value subValue?>`
- `<BarChart data xKey yKey color>`
- `<LineChart data xKey yKey>`

These wrap recharts so swapping libraries later is a one-file change.

### 5.6 What is NOT in the UI
- Custom report builder.
- CSV / PDF export.
- Drill-down ("show me which tickets contributed to this hour").
- Real-time / live updating.
- Tenant-wide aggregation.
- Guest segmentation tooling.
- Email / SMS to guests.
- Loyalty point displays.

---

## 6. Testing

### 6.1 Unit tests
- Each pure helper (date-range, top-items, hourly-mix, summary, servers): comprehensive math + edge cases.
- `withTtlCache` cache hit / miss / expire / invalidate.
- Zod schemas for guest CRUD + analytics inputs.

### 6.2 API integration (Testcontainers)
1. Seed: a couple of menus, items, multiple closed tickets across a few hours/days, a guest, link to one ticket.
2. `salesSummary` over a date range returns correct aggregates (closed + voided counts, gross/net, averageTicket, uniqueGuests).
3. `topItems` returns the right items sorted by each `TopItemsSort`.
4. `hourlyMix` and `dayOfWeekMix` distribute correctly given closedAt timestamps and location timezone.
5. `serverPerformance` per `openedById`.
6. `guestCohort` counts new vs returning correctly.
7. `searchGuests` matches on name/phone (case-insensitive).
8. `linkTicketGuest` updates `Guest.lastSeenAt` and creates audit row.
9. Cross-tenant + cross-location isolation across all queries.

### 6.3 Web unit
- `<KpiCard>`, `<BarChart>` snapshot smoke tests.
- `<GuestPicker>` typeahead behaviour.
- Insights page filter wiring.

### 6.4 Playwright E2E
- `analytics-flow.spec.ts`: seed a couple of closed tickets via Prisma; manager navigates to `/dashboard` and sees non-zero KPIs; navigates to `/insights/items` and sees Latte at the top; navigates to `/insights/hours` and sees a bar.
- `guest-crm-flow.spec.ts`: manager creates a guest "Alice" with phone "555-0100"; opens POS, picks Alice as guest on the active ticket; closes ticket; navigates to `/guests/[id]` and sees the visit + total spent.

---

## 7. Scope guard

In: live aggregation queries, TTL cache, Guest model, Guest linkage to tickets/reservations, dashboard + insights tabs, guests list + profile, pickers in POS + reservation dialog, audit log, location-scoped + cross-tenant isolation.

Out: marketing automation, SMS/email, loyalty programs, predictive/ML, real-time streams, materialized views, CSV/PDF export, drill-down, custom reports, tenant-wide rollups, guest merging, segmentation tags, photo on guest profile.

---

## 8. Acceptance criteria

1. Sign in as Acme owner.
2. Use Prisma helpers to seed a closed ticket with two items (Latte $4.50 + Croissant $3.50), tax 8.25%, total $8.66.
3. Navigate to `/<location>/dashboard` → KPI "Net sales today" shows $8.66.
4. Navigate to `/<location>/insights/items` → "Latte" tops the list at quantity 1, revenue 450¢.
5. Navigate to `/<location>/insights/hours` → one bar at the hour the ticket closed.
6. Navigate to `/<location>/guests` → empty list. Click "New guest", create "Alice" with phone "555-0100".
7. From `/<location>/pos`, open a new ticket, click "Guest" header field, search "Alice", pick → linked.
8. Close the ticket. Navigate to `/<location>/guests/[id]` → visitCount=1, totalSpent matches.
9. CI green: lint, typecheck, unit, integration, web build, all 16 E2E specs (14 prior + 2 new).
