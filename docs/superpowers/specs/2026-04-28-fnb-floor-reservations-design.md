# F&B Control Pane — Floor / Tables / Reservations Sub-Project Design

**Date:** 2026-04-28
**Status:** Approved (brainstorming via blanket approval; ready for implementation planning)
**Sub-project:** 3 of 7 — Floor / Tables / Reservations
**Repo:** `/Users/parth.vora/code/fnb-control-pane`
**Depends on:** Foundation (0), Menu & Catalog (1), POS / Order Management (2a).

---

## 1. Project context

### 1.1 What this sub-project owns

A per-location floor plan with tables, server assignment, reservations, and walk-in waitlist — plus the table↔ticket linkage that POS deliberately deferred.

| # | Sub-project | Status |
|---|---|---|
| 0 | Foundation | Complete |
| 1 | Menu & Catalog | Complete |
| 2a | POS / Order Management | Complete |
| **3** | **Floor / Tables / Reservations** | **This spec** |
| 4 | Online Orders | Future (pay-on-pickup model) |
| 5 | Staff & Scheduling | Future |
| 6 | Analytics & Guest CRM | Future |

### 1.2 Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Floor plan model | One floor per location; `Section` groups; `Table` rows with x/y/w/h/rotation/shape/capacity | Single-floor covers ~95% of restaurants; multi-floor layered on later via a `Floor` parent if needed |
| Table state | `AVAILABLE / OCCUPIED / RESERVED / CLEANING` | Occupied derives from tickets; reserved derives from reservation seating window; cleaning is manual |
| Section | Optional named area ("Patio", "Bar"); tables belong to one section; nullable | Most restaurants have at least 2 sections |
| Ticket linkage | Extend existing `Ticket` model with nullable `tableId` (additive to POS schema) | POS continues to support tableless tickets; floor view opens table-bound tickets |
| Reservations | Single `Reservation` model with `kind: RESERVATION | WALKIN` | Same data shape, different surfaces (book vs waitlist) |
| Reservation status | `PENDING / CONFIRMED / WAITING / SEATED / NO_SHOW / CANCELLED / COMPLETED` | WAITING is walk-ins; SEATED links to ticket |
| Reservation → Ticket | Nullable `Reservation.ticketId` populated when a reservation is seated | Ticket inherits the reservation's table |
| Server assignment | Optional `assignedServerId` per Table; UI shows "my tables" filter | No formal section-based scheduling here (defer to Staff & Scheduling) |
| Real-time | SSE subscription `floorUpdates(locationId)` driven by Postgres LISTEN/NOTIFY | Reuses Foundation's pubsub infrastructure |
| Customer-facing booking | Out of scope | Public web is its own infra phase |
| Auto-assignment | Out of scope | Manual table assignment by host |
| Multi-floor | Out of scope | Single floor per location |
| SMS / email confirmations | Out of scope | External integrations layer later |

### 1.3 RBAC scope rules

| Operation | Required scope |
|---|---|
| View floor plan, table states | `staff` |
| Create/update/delete tables, sections, edit floor plan | `manager` |
| Open ticket from floor (sets tableId) | `staff` |
| Manual state changes (mark CLEANING, mark AVAILABLE) | `staff` |
| Read reservations + waitlist | `staff` |
| Create / update / cancel reservations | `manager` |
| Walk-in (add to waitlist) | `staff` |
| Seat reservation / walk-in (assign table + open ticket) | `staff` |
| Mark NO_SHOW | `manager` |
| Assign server to table | `manager` |

---

## 2. Architecture

### 2.1 Repo impact (additive only)

```
packages/db/prisma/schema.prisma                       ← additions
packages/validation/src/floor.ts                       ← new (table, section schemas)
packages/validation/src/reservation.ts                 ← new
packages/ui/src/patterns/floor-canvas.tsx              ← SVG floor rendering primitive
packages/ui/src/patterns/table-tile.tsx                ← single table representation

apps/api/src/floor/state.ts                            ← pure helper: deriveTableState()
apps/api/src/schema/section.ts                         ← Section type + queries
apps/api/src/schema/table.ts                           ← Table type + queries
apps/api/src/schema/reservation.ts                     ← Reservation type + queries
apps/api/src/schema/mutations/floor/                   ← table + section CRUD, state ops
apps/api/src/schema/mutations/reservations/            ← create/update/cancel/seat/no-show
apps/api/src/schema/subscriptions/floor-updates.ts     ← SSE subscription
apps/api/src/test/integration/floor-reservations.test.ts

apps/web/app/(app)/[tenantSlug]/[locationSlug]/floor/                    ← live floor view
apps/web/app/(app)/[tenantSlug]/[locationSlug]/floor/edit/               ← floor plan editor
apps/web/app/(app)/[tenantSlug]/[locationSlug]/reservations/             ← reservation book
apps/web/app/(app)/[tenantSlug]/[locationSlug]/waitlist/                 ← walk-in waitlist
apps/web/components/floor/                                               ← floor components
apps/web/components/reservations/                                        ← reservation forms + lists
apps/web/lib/graphql/operations/floor.graphql
```

### 2.2 What does NOT change

- Foundation tables, auth, RBAC infra.
- Menu schema.
- POS state machine for ticket lifecycle. POS gains a nullable `tableId` field on `Ticket` only.
- Existing nginx, docker-compose, CI.

---

## 3. Data model

### 3.1 New tables

```prisma
model Section {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId  String    @map("location_id") @db.Uuid
  name        String
  sortOrder   Int       @default(0) @map("sort_order")
  archivedAt  DateTime? @map("archived_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  tables   Table[]

  @@unique([locationId, name])
  @@index([locationId, archivedAt])
  @@map("sections")
}

model Table {
  id                String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId        String      @map("location_id") @db.Uuid
  sectionId         String?     @map("section_id") @db.Uuid
  label             String                                       // "T-12", "Patio 3"
  capacity          Int         @default(2)
  shape             TableShape  @default(RECT)
  positionX         Int         @map("position_x")               // floor canvas px
  positionY         Int         @map("position_y")
  width             Int         @default(80)                     // px
  height            Int         @default(80)
  rotation          Int         @default(0)                      // degrees, 0..359
  manualState       TableManualState @default(NONE) @map("manual_state")  // CLEANING / NONE
  assignedServerId  String?     @map("assigned_server_id") @db.Uuid
  archivedAt        DateTime?   @map("archived_at")
  createdAt         DateTime    @default(now()) @map("created_at")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  location         Location  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  section          Section?  @relation(fields: [sectionId], references: [id], onDelete: SetNull)
  assignedServer   User?     @relation("TableAssignedServer", fields: [assignedServerId], references: [id], onDelete: SetNull)
  tickets          Ticket[]    // back-reference (Ticket.tableId is nullable)
  reservations     Reservation[]

  @@unique([locationId, label])
  @@index([locationId, sectionId])
  @@index([locationId, archivedAt])
  @@map("tables")
}

model Reservation {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId      String              @map("location_id") @db.Uuid
  kind            ReservationKind     @default(RESERVATION)
  status          ReservationStatus   @default(PENDING)

  guestName       String              @map("guest_name")
  guestPhone      String?             @map("guest_phone")
  partySize       Int                 @map("party_size")
  notes           String?

  requestedTime   DateTime?           @map("requested_time")     // null for WALKIN
  durationMinutes Int                 @default(90) @map("duration_minutes")
  tableId         String?             @map("table_id") @db.Uuid
  ticketId        String?             @unique @map("ticket_id") @db.Uuid

  seatedAt        DateTime?           @map("seated_at")
  completedAt     DateTime?           @map("completed_at")
  noShowAt        DateTime?           @map("no_show_at")
  cancelledAt    DateTime?           @map("cancelled_at")
  cancelReason    String?             @map("cancel_reason")

  createdById     String              @map("created_by_id") @db.Uuid
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")

  location  Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  table     Table?   @relation(fields: [tableId], references: [id], onDelete: SetNull)
  ticket    Ticket?  @relation("ReservationTicket", fields: [ticketId], references: [id], onDelete: SetNull)
  createdBy User     @relation("ReservationCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)

  @@index([locationId, status])
  @@index([locationId, requestedTime])
  @@index([tableId])
  @@map("reservations")
}

enum TableShape           { RECT  CIRCLE }
enum TableManualState     { NONE  CLEANING }
enum ReservationKind      { RESERVATION  WALKIN }
enum ReservationStatus    {
  PENDING       // RESERVATION created, not yet confirmed
  CONFIRMED     // RESERVATION confirmed (manual)
  WAITING       // WALKIN waiting for a table
  SEATED        // table assigned + ticket opened
  COMPLETED     // ticket closed and reservation marked done
  NO_SHOW       // RESERVATION marked no-show after grace
  CANCELLED     // either kind cancelled
}
```

### 3.2 Foundation/POS-side relations to add

On `Location`: `sections Section[]`, `tables Table[]`, `reservations Reservation[]`.
On `User`: `tablesAssigned Table[] @relation("TableAssignedServer")`, `reservationsCreated Reservation[] @relation("ReservationCreatedBy")`.
On `Ticket` (POS schema): add nullable `tableId String? @map("table_id") @db.Uuid` + `table Table? @relation(fields: [tableId], references: [id], onDelete: SetNull)` + `reservation Reservation? @relation("ReservationTicket")` (back-reference; the FK is on Reservation).

### 3.3 Decisions baked into the schema

1. **Single state field is split between derived and manual.** `manualState` only holds CLEANING/NONE. The full `tableState` is computed on-demand:
   - If `manualState === 'CLEANING'` → `CLEANING`.
   - Else if any open Ticket has `tableId === this.id` → `OCCUPIED`.
   - Else if any Reservation with status SEATED-pending or CONFIRMED within ±15 min of `requestedTime` references this table → `RESERVED`.
   - Else → `AVAILABLE`.
2. **Soft delete via `archivedAt`** matches Foundation/Menu pattern.
3. **`Reservation.ticketId` is unique.** A reservation links to at most one ticket.
4. **WALKIN reservations have `requestedTime = null`.** Validation (Zod): RESERVATION must have requestedTime; WALKIN must not.
5. **Floor coordinates are integers in pixels** of an abstract canvas. The canvas size is implicit (we render at 100% scale). Future: per-location canvas dimensions if needed.
6. **`assignedServerId` on Table is set explicitly by manager.** Not auto-derived from current ticket — that's a different concept ("who's serving this table right now" via active ticket's `openedById`).

### 3.4 Intentionally NOT here

- Floor (multi-floor) parent entity.
- Public reservation booking widget.
- Customer accounts / loyalty data on Reservation (Guest CRM owns).
- Auto-assignment of tables.
- Drag-drop reservation → table on a calendar.
- SMS / email confirmations.
- Section-level shift schedules (Staff & Scheduling).

---

## 4. GraphQL surface

### 4.1 Object types

```graphql
type Section {
  id: UUID!
  name: String!
  sortOrder: Int!
  archivedAt: DateTime
  tables: [Table!]!
}

type Table {
  id: UUID!
  label: String!
  capacity: Int!
  shape: TableShape!
  positionX: Int!
  positionY: Int!
  width: Int!
  height: Int!
  rotation: Int!
  manualState: TableManualState!
  archivedAt: DateTime
  section: Section
  assignedServer: User

  # Computed
  state: TableState!
  activeTicket: Ticket    # the open ticket bound to this table, if any
  upcomingReservation: Reservation   # next CONFIRMED within next 2 hours, if any
}

type Reservation {
  id: UUID!
  kind: ReservationKind!
  status: ReservationStatus!
  guestName: String!
  guestPhone: String
  partySize: Int!
  notes: String
  requestedTime: DateTime
  durationMinutes: Int!
  table: Table
  ticket: Ticket
  seatedAt: DateTime
  completedAt: DateTime
  noShowAt: DateTime
  cancelledAt: DateTime
  cancelReason: String
  createdBy: User!
  createdAt: DateTime!
}

enum TableShape       { RECT  CIRCLE }
enum TableManualState { NONE  CLEANING }
enum TableState       { AVAILABLE  OCCUPIED  RESERVED  CLEANING }
enum ReservationKind  { RESERVATION  WALKIN }
enum ReservationStatus {
  PENDING  CONFIRMED  WAITING  SEATED  COMPLETED  NO_SHOW  CANCELLED
}
```

### 4.2 Queries

```graphql
extend type Query {
  # Live floor view
  floorTables: [Table!]!                                  # all non-archived tables at viewer's location
  floorSections: [Section!]!

  # Reservations book + waitlist
  reservationsForDay(date: Date!): [Reservation!]!        # RESERVATIONs for the day
  reservationsActive: [Reservation!]!                     # WAITING + SEATED right now
  waitlist: [Reservation!]!                               # WALKIN with status WAITING
  reservation(id: UUID!): Reservation
}
```

All queries `staff` scope and viewer-location-scoped.

### 4.3 Mutations

```graphql
extend type Mutation {
  # Floor edit (manager scope)
  createSection(input: CreateSectionInput!): Section!
  updateSection(input: UpdateSectionInput!): Section!
  archiveSection(input: ArchiveSectionInput!): Section!
  reorderSections(input: ReorderSectionsInput!): [Section!]!

  createTable(input: CreateTableInput!): Table!
  updateTable(input: UpdateTableInput!): Table!           # label, capacity, shape, x/y/w/h/rotation, sectionId
  archiveTable(input: ArchiveTableInput!): Table!
  assignTableServer(input: AssignTableServerInput!): Table!  # set/clear assignedServerId

  # Floor live ops (staff scope)
  setTableManualState(input: SetTableManualStateInput!): Table!  # CLEANING / NONE

  # Reservations (manager for create/update/cancel; staff for walk-in + seat)
  createReservation(input: CreateReservationInput!): Reservation!
  updateReservation(input: UpdateReservationInput!): Reservation!
  cancelReservation(input: CancelReservationInput!): Reservation!  # CANCELLED with optional reason
  confirmReservation(input: ConfirmReservationInput!): Reservation!  # PENDING → CONFIRMED
  markReservationNoShow(input: MarkNoShowInput!): Reservation!     # manager scope

  # Walk-in / waitlist (staff)
  addWalkin(input: AddWalkinInput!): Reservation!  # creates WALKIN with status WAITING

  # Seating: opens a ticket bound to a table, links the reservation
  seatReservation(input: SeatReservationInput!): SeatReservationResult!
  # Inputs: reservationId + tableId (or omitted to use reservation.tableId).
  # Side effects: opens a new Ticket with tableId=table.id, customerLabel=guestName,
  # orderType=DINE_IN; sets reservation.status=SEATED, reservation.ticketId=newTicket.id,
  # reservation.tableId=table.id, reservation.seatedAt=now();
  # publishes floorUpdates event.

  # Direct table seating (no reservation needed) — opens a ticket bound to the table
  openTicketAtTable(input: OpenTicketAtTableInput!): Ticket!
  # Inputs: tableId, optional customerLabel, optional partySize for tracking.

  # Complete a reservation that's been seated (when ticket closes)
  completeReservation(input: CompleteReservationInput!): Reservation!
  # Sets status COMPLETED, completedAt=now(); typically called automatically when
  # the bound Ticket transitions to CLOSED (we wire this in the closeTicket
  # resolver from POS — see "POS integration" below).
}

type SeatReservationResult {
  reservation: Reservation!
  ticket: Ticket!
}
```

### 4.4 Subscription

```graphql
extend type Subscription {
  floorUpdates: FloorUpdateEvent!
}

union FloorUpdateEvent = TableChanged | ReservationChanged

type TableChanged       { table: Table! }
type ReservationChanged { reservation: Reservation! }
```

Subscription is location-scoped via `RequestContext`. Channel name `floor_updates_<locationId>`. Same SSE machinery as POS.

### 4.5 Pure helpers

```ts
// apps/api/src/floor/state.ts
export type DerivedTableState = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';

export function deriveTableState(args: {
  manualState: 'NONE' | 'CLEANING';
  hasOpenTicket: boolean;
  hasImminentReservation: boolean;   // CONFIRMED reservation within ±15 min of requestedTime
}): DerivedTableState;

// pure check: is a Reservation imminent vs. now?
export function isReservationImminent(args: {
  status: 'CONFIRMED' | 'PENDING' | 'WAITING' | 'SEATED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  requestedTime: Date | null;
  now: Date;
  windowMinutes?: number; // default 15
}): boolean;
```

### 4.6 POS integration

Two cross-sub-project hooks (additive only, no breaking changes to POS):

1. **`closeTicket` (POS) auto-completes a linked reservation.** When the POS `closeTicket` resolver successfully closes a ticket, check `prisma.reservation.findFirst({ where: { ticketId } })`. If found, transition it to `COMPLETED` with `completedAt = now()`. Publish a `ReservationChanged` event on the floor channel. The pubsub publish is conditional — only if a reservation exists.

   Implementation pattern: add a helper `apps/api/src/floor/post-close.ts` exporting `completeReservationAfterClose({ prisma, ticketId, locationId })`. Call from inside POS's `closeTicket` resolver as a side-effect after the main close transaction commits.

2. **`voidTicket` and `reopenTicket`**: do not auto-affect reservation. Manual `cancelReservation` / `seatReservation` if the operator wants to mirror.

### 4.7 Audit codes

```
section.created / section.updated / section.archived / section.reordered
table.created / table.updated / table.archived
table.server_assigned / table.manual_state_set
reservation.created / reservation.updated / reservation.confirmed
reservation.cancelled / reservation.no_show / reservation.seated / reservation.completed
walkin.added
ticket.opened_at_table   // augments the existing ticket.opened with tableId
```

---

## 5. UI shape

### 5.1 Live floor view — `/<loc>/floor`

`staff` scope. Full-bleed.

- Top bar: location name, "All sections" filter, "My tables" toggle (filters by `assignedServerId === viewer.id`), legend (Available / Occupied / Reserved / Cleaning), command-palette trigger.
- Main canvas: `FloorCanvas` — SVG rendering of the floor with Tables drawn at their positions. Each Table:
  - Tinted by `state`. Click a Table to open `TableActionSheet`:
    - If AVAILABLE → "Open ticket" (calls `openTicketAtTable`) / "Mark cleaning" / "Edit table" (manager only — links to editor).
    - If OCCUPIED → shows the bound active Ticket (short number, customer label, opened time, total). Button: "Go to ticket in POS" (deep link to `/pos?ticket=<id>`).
    - If RESERVED → shows the upcoming reservation (guestName, partySize, requestedTime). Button: "Seat now" (calls `seatReservation` and opens the ticket).
    - If CLEANING → "Mark available" button.
- Sub-bar: live counts ("8 occupied · 3 available · 2 reserved · 1 cleaning") computed from current data.
- Subscription: `useSubscription(FloorUpdatesDocument)` → on every event refetch `FloorTablesDocument`.

### 5.2 Floor plan editor — `/<loc>/floor/edit`

`manager` scope.

- Two columns: tools sidebar (left) + canvas (right).
- Tools: section management (list + add + reorder), table palette ("Drag to add: 2-top rect, 4-top rect, 6-top circle, 8-top circle"), inspector for the selected table.
- Selected table inspector: label, capacity, shape, section dropdown, dimensions, rotation (0/90/180/270 buttons), assigned server (Select), Archive button.
- Canvas: `FloorCanvas` in edit mode. Drag tables by the body to reposition. Snap to 8px grid. Click empty space to deselect.
- "Save" not needed — every drag-end / property edit fires a debounced `updateTable` mutation. Optimistic UI, with toast on failure.

### 5.3 Reservations book — `/<loc>/reservations`

`staff` to view, `manager` to write (UI gates buttons).

- Left rail: date picker (default today), kind filter (All / Reservations only / Walk-ins only), status filter (all but CANCELLED by default).
- Main: two stacked panels:
  1. **Today's reservations** — DataTable<Reservation> rows ordered by `requestedTime asc`. Columns: time, guestName, partySize, status pill, table label (if assigned), actions (Confirm / Seat / Edit / Cancel / Mark no-show).
  2. **Upcoming next 7 days** — collapsed by default, lazy-load.
- "New reservation" CTA at top → `<NewReservationDialog>` with fields: guestName, guestPhone, partySize, requestedTime (date+time pickers), durationMinutes, table (optional dropdown of tables matching capacity), notes.

### 5.4 Waitlist — `/<loc>/waitlist`

`staff` scope.

- Single-column list of WAITING walk-ins ordered by `createdAt asc`.
- Each row: guestName, partySize, time-since-added (auto-updating), notes, "Seat" button (opens table picker), "Cancel" button.
- "Add to waitlist" button at top → small inline form (guestName + partySize + optional notes).

### 5.5 Cross-cutting

- `<FloorCanvas>` lives in `@repo/ui/patterns/`. View mode renders read-only colored tiles; edit mode adds drag handles + selection. Background grid faintly visible. Tables rendered as SVG `<g>` with `<rect>` (RECT) or `<ellipse>` (CIRCLE), labeled.
- Color tokens for table state come from existing theme: `--color-success-default` (Available), `--color-accent-default` (Occupied), `--color-warning-default` (Reserved — add this token if missing), `--color-fg-muted` (Cleaning).
- Command palette additions: "Go to floor", "New reservation", "Add walk-in", "Open table…" (typeahead by label).

---

## 6. Testing

### 6.1 Unit tests (Vitest)

- `deriveTableState` — every combination of inputs.
- `isReservationImminent` — within window, outside window, status filtering.
- Zod schemas for create/update inputs.

### 6.2 API integration tests (Vitest + Testcontainers)

`apps/api/src/test/integration/floor-reservations.test.ts`. Scenarios:

1. Create section + table; query `floorTables` returns it with derived state AVAILABLE.
2. Open a ticket via `openTicketAtTable`; table state becomes OCCUPIED; close ticket → AVAILABLE again.
3. Seat reservation: CONFIRMED reservation + `seatReservation` → opens ticket, links reservation, table becomes OCCUPIED.
4. Cross-tenant + cross-location isolation: tenant A staff cannot see tenant B's tables; location A staff cannot mutate location B's reservations.
5. Walk-in flow: `addWalkin` → status WAITING; `seatReservation` works for walk-ins too; status flips SEATED.
6. Cancel reservation: preserves history (status CANCELLED, cancelReason set, cancelledAt set).
7. POS integration: closing a ticket linked to a reservation auto-completes the reservation. Verify via `prisma.reservation.findUnique`.
8. Subscription emit: every floor mutation publishes a `floorUpdates` event.
9. Audit codes per spec section 4.7.

Foundation + POS regression suites (tenant-isolation + pos.test.ts) continue to pass.

### 6.3 Web unit tests

- `<FloorCanvas>` renders tables at correct positions; click handler fires.
- `<TableActionSheet>` shows correct actions per state.
- `<NewReservationDialog>` validates fields.

### 6.4 Playwright E2E

`floor-flow.spec.ts`:
1. Manager creates a section "Patio", adds a 4-top table.
2. Staff opens floor view, sees the new table as Available.
3. Click table → "Open ticket" → goes to POS with the ticket pre-bound to the table.
4. Close the ticket (use API helper). Floor view returns to Available within seconds.

`reservation-flow.spec.ts`:
1. Manager creates a reservation for the seeded table for "tomorrow 7pm, 4 people, John".
2. Manager confirms it (status PENDING → CONFIRMED).
3. Staff seats it (status CONFIRMED → SEATED, ticket opened).
4. Close ticket; reservation auto-completes.

Foundation + Menu + POS specs (10 total before this wave) continue to pass.

---

## 7. Scope guard

### 7.1 In scope

- One floor per location, with sections + tables (rect/circle).
- Floor plan editor (drag to reposition, edit properties).
- Live floor view with state-tinted tables, click-to-act.
- Reservations book + walk-in waitlist.
- Server assignment to tables.
- Reservation → ticket linkage; auto-complete on ticket close.
- Real-time `floorUpdates` SSE subscription.
- Audit log entries per spec section 4.7.

### 7.2 Explicit deferrals

- Multi-floor / multi-canvas per location.
- Customer-facing public reservation booking page.
- SMS / email confirmations or reminders.
- Auto-assignment / availability search engine for reservations.
- Drag-drop reservation onto a table on a timeline calendar.
- Section-based server scheduling (Staff & Scheduling).
- Table turnover analytics / heatmaps (Analytics).
- Walk-in quote-time auto-recalculation.
- Tablet-only floor view variant.
- Per-tenant floor canvas size customization.

---

## 8. Acceptance criteria

A new engineer can:

1. Sign in as the seeded Acme owner.
2. Navigate to `/acme/mission-st/floor/edit` — empty floor with an "Add section" prompt.
3. Add a section "Main", add three tables (T-1 4-top rect, T-2 2-top rect, T-3 6-top circle).
4. Navigate to `/acme/mission-st/floor` — see the three tables as AVAILABLE in the live view.
5. Click T-1 → "Open ticket" → lands at `/acme/mission-st/pos?ticket=<id>` with a new ticket bound to T-1.
6. Add an item, fire, mark served, close ticket. Within 2s, T-1 returns to AVAILABLE.
7. Navigate to `/acme/mission-st/reservations` — empty book.
8. Create a reservation: John, 4 people, today 7pm, no specific table. Status PENDING.
9. Confirm it → CONFIRMED.
10. Click "Seat" — assign T-1, opens a new ticket. Status SEATED. T-1 shows OCCUPIED on floor.
11. Close that ticket → reservation auto-completes (COMPLETED).
12. Add a walk-in: Sarah, 2 people. Shows in waitlist.
13. Seat the walk-in to T-2 → ticket opened, T-2 OCCUPIED.
14. CI green: lint, typecheck, unit, integration, web build, all 12 E2E specs (10 prior + 2 new).

Foundation + Menu + POS acceptance criteria all still pass.

---

## 9. Next steps

1. Self-review (below).
2. Invoke `superpowers:writing-plans` for the implementation plan.
3. Execute via subagent-driven-development, wave-by-wave.
4. Sub-project 5 (Staff & Scheduling) brainstorm next.
