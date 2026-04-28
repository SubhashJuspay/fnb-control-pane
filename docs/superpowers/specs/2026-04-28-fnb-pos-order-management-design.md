# F&B Control Pane — POS / Order Management Sub-Project Design

**Date:** 2026-04-28
**Status:** Approved (brainstorming complete via blanket approval; ready for implementation planning)
**Sub-project:** 2a of 7 — POS / Order Management (payment carved out)
**Repo:** `/Users/parth.vora/code/fnb-control-pane`
**Depends on:** Foundation (sub-project 0), Menu & Catalog (sub-project 1).

---

## 1. Project context

### 1.1 What this sub-project owns

The point-of-sale + kitchen-display surface for in-person ordering, **excluding payment capture**. Staff open tickets, build them by selecting menu items, fire them to the kitchen, kitchen marks items ready, servers mark items served, ticket closes with an optional close-note. Discounts and voids land at line and ticket level. Real-time updates between POS and KDS via SSE.

| # | Sub-project | Status |
|---|---|---|
| 0 | Foundation | Complete |
| 1 | Menu & Catalog | Complete |
| **2a** | **POS / Order Management** | **This spec** |
| 3 | Floor / Tables / Reservations | Future |
| 4 | Online Orders | Future (depends on payment) |
| 5 | Staff & Scheduling | Future |
| 6 | Analytics & Guest CRM | Future (depends on POS) |
| — | Payment Capture | Carved out for now — separate phase later |

### 1.2 Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Service mode | Counter + open tabs ("name your tab") | Covers indie restaurants without forcing Floor sub-project; tickets get optional `customerLabel`; `tableId` stays null until Floor lands |
| Ticket lifecycle | Per-line states (`NEW → FIRED → READY → SERVED → VOIDED`) + thin ticket state (`OPEN / CLOSED / VOIDED`) | Matches Toast/Square; KDS can show item-level progress; closure is a deliberate human action |
| KDS surface | Separate route in the same web app (`/[loc]/kds`), SSE-driven | One auth/tenant infra; tablet-friendly; future split to native easy |
| Order types | `DINE_IN`, `TAKEOUT` enum on ticket | Informational now; will affect tax + packaging later |
| Course-based firing | Deferred | `MenuItem.course` already exists; layerable later |
| Discounts | Line + ticket level; flat-amount + percentage; reason codes; **manager** scope | Real money giveaway needs gate above staff |
| Voids | Separate from discounts; **staff** scope; void-reason required | "Wrong item rang in" must be fast for line staff; reason mandatory for audit |
| Closure | `closeTicket` mutation with optional `closeNote` (e.g., "paid cash $25") | Payment is out of scope; this is the bridge until Payment sub-project lands |
| Modifier UX | Required modifier groups must be selected before line is added; dialog-driven picker | Cannot send half-specified items to kitchen |
| Real-time | SSE subscription `ticketUpdates(locationId)`, Postgres `LISTEN/NOTIFY` for cross-instance fan-out | Foundation enabled this; no Redis |
| Concurrent tickets | Unlimited per location; sidebar of recent open tickets in POS | Bartender may juggle 8 tabs |
| Price snapshot | Captured at line-add time using `resolveItemPrice` from Menu sub-project | Mid-shift price changes do not retroactively rewrite tickets |
| Tax computation | Live during ticket; final snapshot at close using `TaxRate.effectiveAt(closeTime)` | Audit-correct; survives rate changes |
| Ticket display number | `shortNumber: int`, sequential per location, daily-reset at `Location.businessDayCutoff` | "#42" is what staff and customers say to each other |
| Audit log | Every write mutation produces one `AuditLog` row | Foundation pattern continues |

### 1.3 RBAC scope rules

| Operation | Required scope |
|---|---|
| Open ticket, add lines, fire, mark ready, mark served, close | `staff` |
| Apply discount (line or ticket) | `manager` |
| Void line, void ticket | `staff` (with mandatory reason) |
| Reopen closed ticket | `manager` |
| Read kitchen display (KDS) feed | `staff` |
| Read sales / ticket reports | `manager` |

---

## 2. Architecture

### 2.1 Repo impact (purely additive to Foundation + Menu)

```
packages/db/prisma/schema.prisma                   ← additions only
packages/validation/src/ticket.ts                  ← new
packages/validation/src/discount.ts                ← new
packages/ui/src/patterns/ticket-card.tsx           ← new (KDS card)
packages/ui/src/patterns/menu-tile-grid.tsx        ← new (POS tile grid)
packages/ui/src/patterns/modifier-picker.tsx       ← new (modifier dialog)

apps/api/src/order/                                ← new pure helpers
  ├─ pricing.ts        (computeLineSubtotal, computeTicketTotals)
  ├─ tax.ts            (resolveTaxAt — picks the right TaxRate for a given timestamp)
  └─ short-number.ts   (next per-location daily-resetting number)
apps/api/src/schema/ticket.ts                      ← Ticket, TicketItem types
apps/api/src/schema/discount.ts                    ← Discount type
apps/api/src/schema/mutations/pos/                 ← one file per mutation
apps/api/src/schema/subscriptions/ticket-updates.ts ← SSE subscription
apps/api/src/pubsub.ts                             ← Postgres LISTEN/NOTIFY pub-sub helper
apps/api/src/test/integration/pos.test.ts          ← Testcontainers integration suite

apps/web/app/(app)/[tenantSlug]/[locationSlug]/pos/         ← POS UI
apps/web/app/(app)/[tenantSlug]/[locationSlug]/kds/         ← KDS UI
apps/web/app/(app)/[tenantSlug]/[locationSlug]/tickets/     ← ticket history / reopen
apps/web/components/pos/                            ← POS-specific components
apps/web/components/kds/                            ← KDS-specific components
apps/web/lib/graphql/operations/pos.graphql        ← new operations
```

### 2.2 What does NOT change

- Foundation tables, auth, RBAC plumbing.
- Menu tables (Category, MenuItem, ModifierGroup, etc.) — POS reads them via existing resolvers.
- The pure helpers `resolveItemPrice` / `resolveModifierPrice` from Menu sub-project — POS calls them at line-add time.
- Existing GraphQL request context, Pothos builder configuration.
- Docker topology, CI workflow, nginx config.

---

## 3. Data model

### 3.1 Core tables

```prisma
model Ticket {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId     String    @map("location_id") @db.Uuid
  shortNumber    Int       @map("short_number")
  businessDay    DateTime  @map("business_day") @db.Date

  customerLabel  String?   @map("customer_label")
  orderType      OrderType @default(DINE_IN) @map("order_type")
  status         TicketStatus @default(OPEN)

  openedById     String    @map("opened_by_id") @db.Uuid
  openedAt       DateTime  @default(now()) @map("opened_at")
  closedById     String?   @map("closed_by_id") @db.Uuid
  closedAt       DateTime? @map("closed_at")
  voidedById     String?   @map("voided_by_id") @db.Uuid
  voidedAt       DateTime? @map("voided_at")
  voidReason     String?   @map("void_reason")
  closeNote      String?   @map("close_note")

  // Snapshotted totals (computed live while OPEN; frozen at close)
  subtotalCents     Int  @default(0) @map("subtotal_cents")
  discountCents     Int  @default(0) @map("discount_cents")
  taxCents          Int  @default(0) @map("tax_cents")
  totalCents        Int  @default(0) @map("total_cents")

  location  Location      @relation(fields: [locationId], references: [id], onDelete: Cascade)
  openedBy  User          @relation("TicketOpenedBy", fields: [openedById], references: [id], onDelete: Restrict)
  closedBy  User?         @relation("TicketClosedBy", fields: [closedById], references: [id], onDelete: Restrict)
  voidedBy  User?         @relation("TicketVoidedBy", fields: [voidedById], references: [id], onDelete: Restrict)
  items     TicketItem[]
  discounts Discount[]    @relation("TicketLevelDiscounts")

  @@unique([locationId, businessDay, shortNumber])
  @@index([locationId, status])
  @@index([locationId, openedAt])
  @@map("tickets")
}

model TicketItem {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId        String    @map("ticket_id") @db.Uuid
  menuItemId      String    @map("menu_item_id") @db.Uuid
  status          TicketItemStatus @default(NEW)

  // Snapshots — frozen at line-add time for audit truth
  nameSnapshot         String  @map("name_snapshot")
  unitPriceCents       Int     @map("unit_price_cents")
  quantity             Int     @default(1)

  // Computed
  modifiersTotalCents  Int     @default(0) @map("modifiers_total_cents")
  lineSubtotalCents    Int     @default(0) @map("line_subtotal_cents")

  notes           String?
  course          ItemCourse  // copied from MenuItem at add time

  firedById       String?   @map("fired_by_id") @db.Uuid
  firedAt         DateTime? @map("fired_at")
  readyAt         DateTime? @map("ready_at")
  servedById      String?   @map("served_by_id") @db.Uuid
  servedAt        DateTime? @map("served_at")
  voidedById      String?   @map("voided_by_id") @db.Uuid
  voidedAt        DateTime? @map("voided_at")
  voidReason      String?   @map("void_reason")

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  ticket    Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  menuItem  MenuItem  @relation(fields: [menuItemId], references: [id], onDelete: Restrict)
  modifiers TicketItemModifier[]
  discounts Discount[] @relation("LineLevelDiscounts")

  @@index([ticketId])
  @@index([ticketId, status])
  @@map("ticket_items")
}

model TicketItemModifier {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketItemId    String   @map("ticket_item_id") @db.Uuid
  modifierId      String   @map("modifier_id") @db.Uuid

  // Snapshots
  nameSnapshot       String  @map("name_snapshot")
  priceDeltaCents    Int     @map("price_delta_cents")
  modifierGroupName  String  @map("modifier_group_name")

  ticketItem  TicketItem @relation(fields: [ticketItemId], references: [id], onDelete: Cascade)
  modifier    Modifier   @relation(fields: [modifierId], references: [id], onDelete: Restrict)

  @@index([ticketItemId])
  @@map("ticket_item_modifiers")
}

model Discount {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId      String        @map("location_id") @db.Uuid

  // Either ticketId OR ticketItemId is set, not both.
  ticketId        String?       @map("ticket_id") @db.Uuid
  ticketItemId    String?       @map("ticket_item_id") @db.Uuid

  kind            DiscountKind                            // FLAT | PERCENT
  amountCents     Int?          @map("amount_cents")      // for FLAT
  percentBp       Int?          @map("percent_bp")        // for PERCENT — basis points (500 = 5%)
  computedCents   Int           @map("computed_cents")    // resolved value, snapshot

  reason          String                                  // free-form, may be from a template
  appliedById     String        @map("applied_by_id") @db.Uuid
  appliedAt       DateTime      @default(now()) @map("applied_at")

  voidedById      String?       @map("voided_by_id") @db.Uuid
  voidedAt        DateTime?     @map("voided_at")
  voidReason      String?       @map("void_reason")

  location    Location    @relation(fields: [locationId], references: [id], onDelete: Cascade)
  ticket      Ticket?     @relation("TicketLevelDiscounts", fields: [ticketId], references: [id], onDelete: Cascade)
  ticketItem  TicketItem? @relation("LineLevelDiscounts", fields: [ticketItemId], references: [id], onDelete: Cascade)
  appliedBy   User        @relation("DiscountAppliedBy", fields: [appliedById], references: [id], onDelete: Restrict)
  voidedBy    User?       @relation("DiscountVoidedBy", fields: [voidedById], references: [id], onDelete: Restrict)

  @@index([ticketId])
  @@index([ticketItemId])
  @@index([locationId, appliedAt])
  @@map("discounts")
}

enum TicketStatus     { OPEN  CLOSED  VOIDED }
enum TicketItemStatus { NEW  FIRED  READY  SERVED  VOIDED }
enum OrderType        { DINE_IN  TAKEOUT }
enum DiscountKind     { FLAT  PERCENT }
```

### 3.2 Foundation-side relations to add

On `Location`: `tickets Ticket[]` and `discounts Discount[]`.
On `User`: four relation fields for the four `User` references on Ticket/Discount (ticketsOpened, ticketsClosed, ticketsVoided, discountsApplied, discountsVoided, ticketItemsFired, ticketItemsServed, ticketItemsVoided).

### 3.3 Schema decisions and rationale

1. **Snapshots everywhere.** `nameSnapshot`, `unitPriceCents`, `priceDeltaCents`, `modifierGroupName` — frozen at the moment the line goes on the ticket. Menu changes never rewrite ticket history.
2. **Per-location daily-resetting `shortNumber`.** Unique within `(locationId, businessDay)`. The `businessDay` column is the calendar date *at the location's `businessDayCutoff`* — so a Friday-night order placed at 1am Saturday still gets `businessDay = Friday`. Computed at ticket open time.
3. **`Discount` has `ticketId` xor `ticketItemId`.** Enforced by a Postgres `CHECK` constraint added in the migration: `CHECK ((ticket_id IS NULL) <> (ticket_item_id IS NULL))`.
4. **`Discount.computedCents` is snapshotted.** A 10% discount on a $100 ticket records `computedCents = 1000` at apply time. If the ticket is modified afterwards, the discount stays $10 — the manager who comped knew what they were comping. If they want to recompute, they void and re-apply.
5. **`onDelete: Restrict` on `MenuItem`/`Modifier` from Ticket lines.** Tickets are an audit trail. Archiving a menu item must not orphan history.
6. **No `tableId` on Ticket yet.** When Floor lands, we add it without breaking anything.
7. **Totals are denormalized on Ticket** (`subtotalCents`, `discountCents`, `taxCents`, `totalCents`). Recomputed on every line/discount mutation while OPEN; snapshotted at close. Reduces query complexity for KDS / list views.
8. **`businessDay` is `@db.Date`** (no time), computed in the location's timezone at open time. Indexes over `(locationId, businessDay)` make daily reports cheap.
9. **`closeNote` is free-form text.** When Payment lands, this column will continue to exist as the "what we know about how this got paid" field for tickets that closed before Payment was wired up.

### 3.4 What is intentionally NOT in the schema

- Payment / tender / settlement tables.
- Tip records.
- Cash drawer / shift-cashier reconciliation.
- Course-fire timing.
- Online-order channel flag (channel-specific data lives in Online Orders sub-project).
- Server / printer routing tables (deferred — KDS shows everything in one view for now).
- Split checks / move item between tickets.
- Refunds (no payments, no refunds).

---

## 4. GraphQL surface

### 4.1 Object types

```graphql
type Ticket {
  id: UUID!
  shortNumber: Int!
  businessDay: Date!
  customerLabel: String
  orderType: OrderType!
  status: TicketStatus!

  openedBy: User!
  openedAt: DateTime!
  closedBy: User
  closedAt: DateTime
  voidedBy: User
  voidedAt: DateTime
  voidReason: String
  closeNote: String

  items: [TicketItem!]!
  discounts: [Discount!]!

  subtotalCents: Int!
  discountCents: Int!
  taxCents: Int!
  totalCents: Int!

  # Computed fields
  itemSummary: String!     # e.g., "3 items: 1 Latte, 2 Croissant"
  isLive: Boolean!         # status == OPEN
}

type TicketItem {
  id: UUID!
  status: TicketItemStatus!
  menuItem: MenuItem!
  nameSnapshot: String!
  unitPriceCents: Int!
  quantity: Int!
  modifiers: [TicketItemModifier!]!
  modifiersTotalCents: Int!
  lineSubtotalCents: Int!
  notes: String
  course: ItemCourse!

  firedBy: User
  firedAt: DateTime
  readyAt: DateTime
  servedBy: User
  servedAt: DateTime
  voidedBy: User
  voidedAt: DateTime
  voidReason: String

  discounts: [Discount!]!
  effectivePriceAfterDiscountsCents: Int!  # lineSubtotal − line-level discounts
}

type TicketItemModifier {
  id: UUID!
  modifier: Modifier!
  nameSnapshot: String!
  priceDeltaCents: Int!
  modifierGroupName: String!
}

type Discount {
  id: UUID!
  kind: DiscountKind!
  amountCents: Int
  percentBp: Int
  computedCents: Int!
  reason: String!
  appliedBy: User!
  appliedAt: DateTime!
  voidedBy: User
  voidedAt: DateTime
  voidReason: String
  scope: DiscountScope!         # union — TicketLevel | LineLevel
}

enum TicketStatus     { OPEN  CLOSED  VOIDED }
enum TicketItemStatus { NEW  FIRED  READY  SERVED  VOIDED }
enum OrderType        { DINE_IN  TAKEOUT }
enum DiscountKind     { FLAT  PERCENT }

union DiscountScope = TicketScope | LineScope
type TicketScope { ticket: Ticket! }
type LineScope   { ticketItem: TicketItem! }
```

### 4.2 Queries

```graphql
extend type Query {
  # POS — read open tickets at viewer's location
  openTickets: [Ticket!]!                           # status: OPEN, ordered by openedAt asc
  ticket(id: UUID!): Ticket                         # single ticket; viewer must have location access

  # KDS — kitchen feed
  kitchenTickets: [Ticket!]!                        # tickets with at least one FIRED-or-READY item; ordered by oldest unready item

  # History (manager scope)
  ticketHistory(first: Int, after: String, filter: TicketHistoryFilter): TicketConnection!
  ticketByShortNumber(shortNumber: Int!, businessDay: Date!): Ticket
}

input TicketHistoryFilter {
  status: TicketStatus
  fromDate: Date
  toDate: Date
  serverId: UUID
}
```

### 4.3 Mutations

```graphql
extend type Mutation {
  # Ticket lifecycle (staff scope)
  openTicket(input: OpenTicketInput!): Ticket!
  updateTicketLabel(input: UpdateTicketLabelInput!): Ticket!
  updateTicketOrderType(input: UpdateTicketOrderTypeInput!): Ticket!
  closeTicket(input: CloseTicketInput!): Ticket!
  reopenTicket(input: ReopenTicketInput!): Ticket!         # manager scope
  voidTicket(input: VoidTicketInput!): Ticket!

  # Line management (staff scope)
  addTicketItem(input: AddTicketItemInput!): TicketItem!
  updateTicketItem(input: UpdateTicketItemInput!): TicketItem!  # quantity, notes
  voidTicketItem(input: VoidTicketItemInput!): TicketItem!
  setTicketItemModifiers(input: SetTicketItemModifiersInput!): TicketItem!  # replaces all modifiers atomically while still NEW

  # Fire / progress (staff scope, with status-machine guards)
  fireTicket(input: FireTicketInput!): Ticket!           # bulk: every NEW item → FIRED
  fireTicketItem(input: FireTicketItemInput!): TicketItem!
  markTicketItemReady(input: MarkTicketItemReadyInput!): TicketItem!  # KDS bump
  markTicketItemServed(input: MarkTicketItemServedInput!): TicketItem!

  # Discounts (manager scope)
  applyTicketDiscount(input: ApplyTicketDiscountInput!): Discount!
  applyLineDiscount(input: ApplyLineDiscountInput!): Discount!
  voidDiscount(input: VoidDiscountInput!): Discount!
}

input OpenTicketInput {
  customerLabel: String
  orderType: OrderType = DINE_IN
}

input AddTicketItemInput {
  ticketId: UUID!
  menuItemId: UUID!
  quantity: Int = 1
  modifiers: [AddTicketItemModifierInput!]
  notes: String
}

input AddTicketItemModifierInput { modifierId: UUID! }

input ApplyTicketDiscountInput {
  ticketId: UUID!
  kind: DiscountKind!
  amountCents: Int            # for FLAT
  percentBp: Int              # for PERCENT (500 = 5%)
  reason: String!
}

input ApplyLineDiscountInput {
  ticketItemId: UUID!
  kind: DiscountKind!
  amountCents: Int
  percentBp: Int
  reason: String!
}

input VoidTicketItemInput {
  ticketItemId: UUID!
  voidReason: String!
}

input CloseTicketInput {
  ticketId: UUID!
  closeNote: String
}
```

### 4.4 Subscriptions

```graphql
extend type Subscription {
  # All ticket lifecycle and line state changes at the viewer's location.
  # Emits whenever any ticket or ticket item is created/updated.
  ticketUpdates: TicketUpdateEvent!
}

union TicketUpdateEvent = TicketChanged | TicketItemChanged | DiscountChanged

type TicketChanged { ticket: Ticket! }
type TicketItemChanged { ticketItem: TicketItem!, ticketId: UUID! }
type DiscountChanged { discount: Discount!, ticketId: UUID! }
```

Subscription is location-scoped via the `RequestContext`. SSE transport (Yoga's `useGraphQLSSE`). Cross-instance fan-out via Postgres `LISTEN/NOTIFY` on a channel named `ticket_updates_<locationId>`.

### 4.5 Pure helpers (single source of truth for state machine + math)

`apps/api/src/order/`:

```ts
// pricing.ts
export function computeLineSubtotalCents(args: {
  unitPriceCents: number;
  quantity: number;
  modifiers: Array<{ priceDeltaCents: number }>;
}): { modifiersTotalCents: number; lineSubtotalCents: number };

export function computeTicketTotalsCents(args: {
  items: Array<{ lineSubtotalCents: number; discountsCents: number; status: TicketItemStatus }>;
  ticketDiscountsCents: number;
  taxRatePermille: number;
}): { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number };

// state.ts
export function canTransitionTicketItem(from: TicketItemStatus, to: TicketItemStatus): boolean;
export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean;
export function canCloseTicket(items: Array<{ status: TicketItemStatus }>): boolean;  // all items SERVED or VOIDED

// short-number.ts
export async function nextShortNumber(args: {
  prisma: PrismaClient;
  locationId: string;
  businessDay: Date;
}): Promise<number>;  // SELECT MAX(short_number) + 1 within (locationId, businessDay)

// tax.ts
export async function resolveTaxRateAt(args: {
  prisma: PrismaClient;
  taxCategoryId: string;
  locationId: string;
  at: Date;
}): Promise<number>;  // returns ratePermille from the appropriate TaxRate row
```

All pure-function-tested.

### 4.6 Audit log conventions

```
ticket.opened
ticket.label_updated
ticket.order_type_updated
ticket.closed
ticket.reopened
ticket.voided
ticket_item.added
ticket_item.updated
ticket_item.voided
ticket_item.modifiers_set
ticket_item.fired
ticket_item.marked_ready
ticket_item.marked_served
discount.ticket.applied
discount.line.applied
discount.voided
```

Metadata blobs include the resource ids (ticketId, ticketItemId), key state (oldStatus, newStatus), and any reason text.

---

## 5. UI shape

### 5.1 POS surface — `/[tenantSlug]/[locationSlug]/pos`

Touch-first two-column layout. Designed for a tablet but works on desktop.

```
┌─────────────────────────────────────────────────────────────────┐
│ Top bar: Location | Open tickets [3] | New ticket | User menu  │
├──────────────────────────┬──────────────────────────────────────┤
│                          │  Active ticket #42                   │
│  Menu tile grid          │  Sarah · Dine in · 12:34pm           │
│  [Latte]  [Cappuccino]  │  ─────────────────────────────────   │
│  [Coffee] [Tea]          │  • 1× Latte (Medium)        $5.25   │
│  [Croissant] [Bagel]     │     [Modify] [Void]                  │
│  ...                     │  • 2× Croissant             $7.00   │
│                          │     [Modify] [Void]                  │
│  Categories              │  ─────────────────────────────────   │
│  [Drinks] [Pastries]     │  Subtotal           $12.25           │
│  [Mains] [...]           │  Discount           −$1.00           │
│                          │  Tax (8.25%)        $0.93            │
│                          │  Total              $12.18           │
│                          │  [Apply discount] [Fire all]         │
│                          │  [Close ticket]                      │
└──────────────────────────┴──────────────────────────────────────┘
```

**Components:**
- `OpenTicketsSidebar` (collapsible left rail or top dropdown) — list of open tickets at this location, sortable by recent. Selecting one makes it the active ticket.
- `MenuTileGrid` (`@repo/ui/patterns/menu-tile-grid`) — grid of items in the active menu(s). Tapping an item: if the item has required modifier groups, opens `ModifierPicker` dialog. Otherwise adds directly to the active ticket.
- `ModifierPicker` (`@repo/ui/patterns/modifier-picker`) — dialog enforcing min/max selection rules from Menu sub-project. "Add to ticket" button is disabled until validation passes.
- `TicketPanel` (right column) — header (short number, label, type, opened time), line list, totals block, action row. Live-updated by the subscription.
- `LineRow` — single line: quantity, name, modifier summary line, price, status pill, kebab menu (Modify / Void).
- `DiscountDialog` — apply line or ticket discount (radio: kind, input for amount/percent, reason select w/ free-text fallback).
- `CloseTicketDialog` — close-note textarea + confirm.
- `VoidLineDialog` and `VoidTicketDialog` — both require a reason.

### 5.2 KDS surface — `/[tenantSlug]/[locationSlug]/kds`

Full-screen, dark-theme-friendly. One card per active ticket.

```
┌────────────────────────────────────────────────────────────────┐
│ KDS · Mission St · 8 active · Live                             │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ #42 · Sarah  │  │ #43          │  │ #44 · TO GO  │          │
│  │ 03:21 ago    │  │ 01:05 ago    │  │ 00:42 ago    │          │
│  │ ─────────    │  │ ─────────    │  │ ─────────    │          │
│  │ • Latte M    │  │ • Latte L    │  │ • Bagel      │          │
│  │   [BUMP]     │  │   [BUMP]     │  │   [BUMP]     │          │
│  │ • Croissant  │  │ • Cappuccino │  │              │          │
│  │   [BUMP]     │  │   [BUMP]     │  │              │          │
│  │              │  │ • Coffee     │  │              │          │
│  │              │  │   ✓ ready    │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────────────────────────────────────────────────┘
```

**Components:**
- `KdsBoard` — grid container, subscribed to `ticketUpdates`.
- `KdsTicketCard` (`@repo/ui/patterns/ticket-card`) — header (short number, label, order type, time-since-fire), grouped item list, big touch-friendly bump buttons. Cards turn yellow at 5 minutes, red at 10 minutes (configurable later).
- Items grouped by `course` within a ticket; sections separated visually.
- Cards auto-disappear when all items are READY or SERVED (no manual close from KDS — server closes the ticket from POS once items are picked up / served).

### 5.3 Tickets history — `/[tenantSlug]/[locationSlug]/tickets`

Manager scope. `DataTable<Ticket>` with date-range filter, status filter, server filter. Columns: short number, opened-at, customer label, server, line count, total, status. Row → ticket detail page (read-only ticket view + reopen button if CLOSED).

### 5.4 Cross-cutting UI bits

- **Money formatting:** continues to use `formatMoney(cents, currency)` from `@repo/ui` (Wave 4 of Menu sub-project).
- **Subscription wiring:** urql's `useSubscription` hook with the SSE-aware client (Foundation's urql client supports it). On every event, refetch the relevant ticket(s).
- **Optimistic mutations:** add-line, void-line, mark-ready all optimistically update the cache; the subscription confirms within ~100ms.
- **Tablet ergonomics:** all interactive targets ≥ 44pt. Modifier picker dialog uses radio/checkbox tiles, not tiny inputs.
- **Color tokens:** continue using the existing `@repo/ui` theme. KDS uses a darker variant — high-contrast for kitchen lighting.
- **Command palette:** registers actions "New ticket", "Open KDS", "Open POS", "Find ticket #…".

### 5.5 What is intentionally NOT in the UI

- Payment screen / split-check / tip pad.
- Receipt printing.
- Bulk-select on tickets.
- Drag-drop reorder of items in a ticket (sort is by add order).
- Server PIN entry (uses existing Auth.js session).
- Customizable KDS routing (printer station / station-grouping).

---

## 6. Testing

### 6.1 Unit tests (Vitest)

- `computeLineSubtotalCents` — quantity × unitPrice + sum(modifier deltas).
- `computeTicketTotalsCents` — sums lines (excluding voided), applies ticket-level discounts, applies tax to net subtotal.
- `canTransitionTicketItem` — enforces NEW→FIRED→READY→SERVED + NEW→VOIDED + FIRED→VOIDED + VOIDED is terminal.
- `canTransitionTicket` — OPEN→CLOSED requires all items SERVED or VOIDED; OPEN→VOIDED any time; CLOSED→OPEN (reopen) sends ticket back to OPEN with item statuses preserved.
- `nextShortNumber` — first ticket of business day = 1; second = 2; resets across business days.
- Zod schemas for every mutation input — accept valid, reject malformed.

### 6.2 API integration tests (Vitest + Testcontainers)

Required scenarios:
1. **Open → add → fire → ready → served → close** — happy path; assert state transitions, totals, audit log entries.
2. **Cross-tenant isolation** — tenant A staff cannot read or mutate tenant B tickets.
3. **Cross-location isolation** — staff at location A cannot operate on location B tickets.
4. **Required modifier enforcement** — `addTicketItem` for an item with a required-1 modifier group fails if no modifier provided.
5. **Snapshot pricing** — change `MenuItem.basePriceCents` after adding line; ticket line price stays at the snapshot value.
6. **Daily-resetting short number** — open three tickets across two business days; assert numbering.
7. **Discount math** — flat $5 line discount on a $20 line → line discounts $5; 10% ticket discount on $30 subtotal → $3 discount; mixed line + ticket discounts compute correctly.
8. **Discount manager-scope gate** — staff cannot apply discount; manager can.
9. **Void line** — voided line excluded from totals; cannot be re-fired; audit row written.
10. **Tax math** — apply 8.25% tax category; total computes correctly with discounts subtracted from subtotal first.
11. **`canCloseTicket` enforcement** — closing a ticket with NEW or FIRED items returns ConflictError.
12. **Reopen** — closed ticket reopens; status flips back to OPEN; audit row.
13. **Subscription emit** — every state change pushes a `TicketUpdateEvent` (test the pub-sub helper, not the SSE transport itself).
14. **Audit codes** — every mutation produces exactly one row with the documented action code.

### 6.3 Web unit tests (Vitest + Testing Library)

- `ModifierPicker` — required group disables submit until selection made; max-selections enforced.
- `TicketPanel` — totals re-render on subscription event mock.
- `KdsTicketCard` — bump button triggers mutation; age-based color thresholds.
- `MenuTileGrid` — tap fires the right callback; required-modifier item opens picker.

### 6.4 Playwright E2E

Three new specs:
- `pos-flow.spec.ts` — staff opens ticket, adds two items (one with required modifier), fires, marks ready, marks served, closes with note; verifies UI reflects each state.
- `kds-flow.spec.ts` — fire a ticket from POS in one tab; KDS in another tab shows the ticket card within a few seconds (subscription); bump items, card disappears when all ready.
- `discount-and-void.spec.ts` — manager applies a $5 ticket discount with reason; staff voids a line with reason; ticket totals reflect both; audit log shows correct entries.

The Foundation + Menu E2E specs (7 total) continue to pass.

---

## 7. Scope guard

### 7.1 In scope

| Capability | Notes |
|---|---|
| Ticket open / close / void / reopen | Closure via `closeTicket`, payment-agnostic |
| Per-line state machine (NEW → FIRED → READY → SERVED → VOIDED) | Pure helper enforces transitions |
| Ticket-level state (OPEN / CLOSED / VOIDED) | Closure requires all items SERVED or VOIDED |
| Add / update / void lines | Snapshots price + name + modifiers at add time |
| Modifier group rules enforced at add time | Required groups must be satisfied |
| Line-level + ticket-level discounts | FLAT and PERCENT, manager scope, reason required |
| Voids with mandatory reason | Staff scope |
| Per-location daily-resetting short number | Resets at `Location.businessDayCutoff` |
| Live tax computation | Uses Menu's time-bounded `TaxRate` |
| Snapshotted totals on Ticket | Frozen at close |
| KDS feed via SSE subscription | Real-time bump experience |
| POS UI (touch tile grid + active ticket panel) | Two-column layout |
| KDS UI (tablet card view with bump buttons) | One card per active ticket |
| Ticket history page (manager scope) | Search by date / status / server |
| Audit log entries | Foundation pattern |
| Counter + open-tab service mode | Optional `customerLabel`; no `tableId` yet |

### 7.2 Explicit deferrals

| Deferred capability | Lives in |
|---|---|
| Payment capture, tips, settlement | Future Payment phase |
| Cash drawer reconciliation | Future Payment phase |
| Course-based fire / pacing | Future POS extension |
| Printer / station routing for KDS | Future KDS extension |
| Split-checks, move item between tickets | Future POS extension |
| Bulk operations (fire several tickets at once) | Future POS extension |
| Refunds | Requires Payment first |
| Online-channel tickets | Online Orders sub-project |
| Server PIN / clock-in for ticket attribution | Staff & Scheduling sub-project |
| Table linkage | Floor sub-project |
| Tipping / gratuity / service-charge | Future Payment phase |
| Tax-exempt customers / customer profiles on tickets | Guest CRM sub-project |

---

## 8. Acceptance criteria

A new engineer can:

1. Sign in as the seeded Acme owner.
2. Confirm at least one menu and one item exist (use Menu sub-project's flow if needed).
3. Navigate to `/acme/mission-st/pos` — see an empty POS screen with the menu tile grid and a "New ticket" CTA.
4. Open a new ticket with `customerLabel = "Sarah"`, `orderType = DINE_IN`. Ticket #1 appears.
5. Tap a Latte tile — modifier picker opens for the Size group; pick Medium. Latte added at the snapshotted price.
6. Tap two Croissants. Two Croissant lines added (or one line with quantity 2).
7. "Fire all" — all NEW items move to FIRED. Tax + total update.
8. Open `/acme/mission-st/kds` in a second tab — Ticket #1 card appears within 2 seconds, showing both items.
9. Bump the Latte from KDS — line moves to READY in both POS and KDS within 2 seconds.
10. Mark Latte SERVED from POS. Bump Croissant from KDS, mark served from POS.
11. Apply a 10% discount to the ticket as the owner (manager scope). Total updates.
12. Close ticket with closeNote "paid cash". Status flips to CLOSED; totals freeze.
13. Reopen the ticket from history — status flips back to OPEN; close-note cleared on reopen, audit log entries for both close + reopen.
14. CI green: lint, typecheck, unit, integration, web build, all 10 E2E specs (4 Foundation + 3 Menu + 3 POS).

The Foundation and Menu acceptance criteria (sections 9 / 8 of their respective specs) all still pass.

---

## 9. Next steps

1. Self-review (below) — fix inline.
2. Invoke `superpowers:writing-plans` to produce the implementation plan.
3. Execute via subagent-driven development, wave-by-wave.
4. Sub-project 3 (Floor / Tables / Reservations) brainstorm begins after POS is verified.
