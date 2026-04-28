# F&B Control Pane — Online Orders (Pay-on-Pickup) Sub-Project Design

**Date:** 2026-04-28
**Status:** Approved (blanket approval; ready for planning)
**Sub-project:** 4 of 7 — Online Orders (degraded, pay-on-pickup model)
**Depends on:** Foundation (0), Menu & Catalog (1), POS (2a), Guest CRM (6).

---

## 1. Project context

### 1.1 What this owns

A public, no-auth-required customer surface where guests can browse a location's active menu, build a cart, submit a takeout order, and track its status. Staff confirm and prepare the order via a new POS-side inbox. **Payment is captured manually at pickup** (cash, external card terminal) — the platform records the closure with a free-form note. This is the "pay-on-pickup" degraded mode that Online Orders proper would replace once payment processing lands.

### 1.2 Locked decisions

| Decision | Choice |
|---|---|
| Customer auth | None — anonymous order submission with phone + name capture |
| Reuse POS Ticket | Yes — online orders create regular Tickets with `orderType=TAKEOUT` and a sibling `OnlineOrderRequest` row carrying online-specific data |
| Public routes | New `(public)` route group: `/order/[tenantSlug]/[locationSlug]` (browse + cart) and `/order/[tenantSlug]/[locationSlug]/track/[token]` |
| Acceptance flow | Manual — staff click "Confirm" in POS inbox to fire items; "Reject" voids ticket |
| Pickup timing | "ASAP" (target = now + 15 min) or "Scheduled" (date+time picker; min 15 min from now, max 7 days out) |
| Real-time inbox | SSE subscription `onlineOrderRequests(locationId)` — new arrivals push to the staff inbox |
| Customer order tracking | Single-use 32-char tracking token in URL; polling 5s on the track page (no SSE for public) |
| Guest CRM integration | At submit, if phone matches an existing Guest in the tenant, auto-link `Ticket.guestId`; otherwise create a new Guest with name + phone |
| Payment | Out of scope. `Ticket.closeNote` carries free-form payment record at close |
| Delivery | Out of scope — pickup only |
| Account creation | Out of scope |
| SMS / email confirmations | Out of scope |
| Ratings / tips | Out of scope |
| Saved carts | Out of scope |
| Restaurant-side analytics on online vs. in-person mix | Already covered by the Analytics sub-project's existing `orderType` filter (no new resolvers needed in this phase) |

### 1.3 RBAC

| Operation | Required scope |
|---|---|
| Browse public menu, submit order, track order | None (anonymous, rate-limited) |
| View online-order inbox | `staff` |
| Confirm online order | `staff` |
| Reject online order | `manager` (real money giveaway implications) |

---

## 2. Architecture

Purely additive.

```
packages/db/prisma/schema.prisma                       ← additions
packages/validation/src/online-order.ts                ← new

apps/api/src/online-orders/
  ├─ rate-limit.ts        (per-IP token-bucket, in-memory)
  ├─ tracking-token.ts    (generate / hash)
apps/api/src/schema/online-order-request.ts            ← OnlineOrderRequest type + queries
apps/api/src/schema/mutations/online-orders/           ← submitOnlineOrder, confirmOnlineOrder, rejectOnlineOrder
apps/api/src/schema/subscriptions/online-order-requests.ts
apps/api/src/test/integration/online-orders.test.ts

apps/web/app/(public)/                                 ← new route group, no auth
  └─ order/[tenantSlug]/[locationSlug]/
      ├─ page.tsx                                      menu browse + cart
      ├─ checkout/page.tsx                             customer details + pickup time
      ├─ confirmation/[token]/page.tsx                 success + tracking link
      └─ track/[token]/page.tsx                        order status

apps/web/app/(app)/[tenantSlug]/[locationSlug]/online-orders/   ← staff inbox (manager scope)
apps/web/components/online-orders/                              ← inbox, request card, accept/reject dialogs
apps/web/components/order/                                      ← public-facing menu, cart, checkout
apps/web/lib/graphql/operations/online-orders.graphql
```

Constraints on the public route group:
- Layout under `(public)` does not call `auth()` and does not wrap in `<GraphqlProvider>` with a tenant scope. It uses a separate urql client instance configured for anonymous requests (no `x-tenant-slug`/`x-location-id` headers since those would normally trigger membership checks). The api resolvers for public queries/mutations explicitly accept anonymous context and resolve tenant/location from the operation arguments instead.

---

## 3. Data model

```prisma
model OnlineOrderRequest {
  id             String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId       String                     @unique @map("ticket_id") @db.Uuid
  locationId     String                     @map("location_id") @db.Uuid

  customerName   String                     @map("customer_name")
  customerPhone  String                     @map("customer_phone")
  customerEmail  String?                    @map("customer_email")
  pickupAt       DateTime                   @map("pickup_at")
  pickupKind     OnlinePickupKind           @map("pickup_kind")
  notes          String?

  confirmStatus  OnlineOrderConfirmStatus   @default(PENDING) @map("confirm_status")
  confirmedAt    DateTime?                  @map("confirmed_at")
  confirmedById  String?                    @map("confirmed_by_id") @db.Uuid
  rejectedAt     DateTime?                  @map("rejected_at")
  rejectedById   String?                    @map("rejected_by_id") @db.Uuid
  rejectReason   String?                    @map("reject_reason")

  trackingTokenHash String                  @unique @map("tracking_token_hash")
  submittedFromIp   String?                 @map("submitted_from_ip")

  createdAt      DateTime                   @default(now()) @map("created_at")
  updatedAt      DateTime                   @updatedAt @map("updated_at")

  ticket       Ticket    @relation("TicketOnlineRequest", fields: [ticketId], references: [id], onDelete: Cascade)
  location     Location  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  confirmedBy  User?     @relation("OnlineOrderConfirmedBy", fields: [confirmedById], references: [id], onDelete: SetNull)
  rejectedBy   User?     @relation("OnlineOrderRejectedBy", fields: [rejectedById], references: [id], onDelete: SetNull)

  @@index([locationId, confirmStatus])
  @@index([locationId, createdAt])
  @@map("online_order_requests")
}

enum OnlinePickupKind          { ASAP  SCHEDULED }
enum OnlineOrderConfirmStatus  { PENDING  CONFIRMED  REJECTED }
```

Foundation/POS-side relations to add:
- On `Ticket` (POS): `onlineRequest OnlineOrderRequest? @relation("TicketOnlineRequest")` — back-reference; FK lives on OnlineOrderRequest. Also add `originChannel OrderOriginChannel @default(IN_PERSON)` to disambiguate ticket origin without joining. New enum `OrderOriginChannel { IN_PERSON ONLINE }`.
- On `Location`: `onlineOrderRequests OnlineOrderRequest[]`.
- On `User`: `onlineOrdersConfirmed OnlineOrderRequest[] @relation("OnlineOrderConfirmedBy")`, `onlineOrdersRejected OnlineOrderRequest[] @relation("OnlineOrderRejectedBy")`.

Decisions:
1. **Tracking token is hashed at rest.** Plaintext token is returned to the customer once at submit; hash via SHA-256 + a server-side pepper for lookups. Mirrors invitation-token pattern from Foundation.
2. **`submittedFromIp` is stored for rate limiting and abuse forensics.** Capped at 45 chars; nullable for tests.
3. **`originChannel` lives on Ticket** so existing Ticket queries and the analytics sub-project can filter without a join.
4. **`Ticket.guestId` linkage** happens during `submitOnlineOrder` if phone matches.

CHECK constraint on `online_order_requests`: scheduled pickups must have `pickup_at > created_at + 14 minutes` (the spec's 15-min minimum, with a 1-min jitter tolerance) — enforced in the Zod input rather than DB CHECK because the relationship to `now()` is dynamic. Skip the DB CHECK.

---

## 4. GraphQL surface

### 4.1 Object types

```graphql
type OnlineOrderRequest {
  id: UUID!
  customerName: String!
  customerPhone: String!
  customerEmail: String
  pickupAt: DateTime!
  pickupKind: OnlinePickupKind!
  notes: String
  confirmStatus: OnlineOrderConfirmStatus!
  confirmedAt: DateTime
  rejectedAt: DateTime
  rejectReason: String
  createdAt: DateTime!

  ticket: Ticket!
  confirmedBy: User
  rejectedBy: User
}

enum OnlinePickupKind         { ASAP  SCHEDULED }
enum OnlineOrderConfirmStatus { PENDING  CONFIRMED  REJECTED }
enum OrderOriginChannel       { IN_PERSON  ONLINE }

# Public-facing, sanitized projection — no internal user info.
type OnlineOrderTracking {
  shortNumber: Int!
  customerName: String!
  pickupAt: DateTime!
  pickupKind: OnlinePickupKind!
  confirmStatus: OnlineOrderConfirmStatus!
  ticketStatus: TicketStatus!         # OPEN / CLOSED / VOIDED
  itemSummary: String!                 # "1 Latte, 2 Croissant"
  totalCents: Int!
  taxCents: Int!
  subtotalCents: Int!
  estimatedReadyAt: DateTime           # if CONFIRMED, naive estimate = max(pickupAt, confirmedAt + 10min)
  rejectReason: String                 # populated only if rejected
  isReady: Boolean!                    # all items READY/SERVED
}
```

### 4.2 Queries

```graphql
extend type Query {
  # Public — browse the active menu via existing locationActiveMenus.
  # No new public menu query; the public web app calls the existing locationActiveMenus
  # but with the tenant + location resolved server-side from URL slugs. To support that,
  # we expose a tenant + location lookup-by-slug query that DOES NOT require auth:
  publicLocationBySlug(tenantSlug: String!, locationSlug: String!): PublicLocation

  # Staff inbox
  onlineOrderRequests(filter: OnlineOrderFilter): [OnlineOrderRequest!]!  # staff scope
  onlineOrderRequest(id: UUID!): OnlineOrderRequest                       # staff scope

  # Public order tracking
  trackOnlineOrder(token: String!): OnlineOrderTracking                   # anonymous
}

type PublicLocation {
  id: UUID!
  name: String!
  slug: String!
  timezone: String!
  currency: String!
  tenantName: String!
  # Re-exposes the shape of locationActiveMenus but resolves tenant/location from args
  activeMenus(at: DateTime): [PublicMenu!]!
}

type PublicMenu {
  id: UUID!
  name: String!
  description: String
  sections: [PublicMenuSection!]!
}

type PublicMenuSection {
  id: UUID!
  name: String!
  items: [PublicMenuItem!]!
}

# Sanitized item — only what a customer needs.
type PublicMenuItem {
  id: UUID!
  name: String!
  shortDescription: String
  description: String
  imageUrl: String
  effectivePriceCents: Int!
  available: Boolean!
  dietaryTags: [String!]!
  modifierGroups: [PublicModifierGroup!]!
}

type PublicModifierGroup {
  id: UUID!
  name: String!
  minSelections: Int!
  maxSelections: Int!
  modifiers: [PublicModifier!]!
}

type PublicModifier {
  id: UUID!
  name: String!
  priceDeltaCents: Int!
  available: Boolean!
}

input OnlineOrderFilter {
  status: OnlineOrderConfirmStatus
  fromDate: Date
  toDate: Date
}
```

### 4.3 Mutations

```graphql
extend type Mutation {
  # Public, anonymous. Rate-limited per IP (10/min, 100/hour).
  submitOnlineOrder(input: SubmitOnlineOrderInput!): SubmitOnlineOrderResult!

  # Staff inbox
  confirmOnlineOrder(input: ConfirmOnlineOrderInput!): OnlineOrderRequest!
  rejectOnlineOrder(input: RejectOnlineOrderInput!): OnlineOrderRequest!  # manager scope
}

input SubmitOnlineOrderInput {
  tenantSlug: String!
  locationSlug: String!
  customerName: String!
  customerPhone: String!
  customerEmail: String
  pickupKind: OnlinePickupKind!
  pickupAt: DateTime               # required when SCHEDULED
  notes: String
  items: [SubmitOnlineOrderItemInput!]!
}

input SubmitOnlineOrderItemInput {
  menuItemId: UUID!
  quantity: Int!
  modifiers: [UUID!]               # modifier ids
  notes: String
}

type SubmitOnlineOrderResult {
  trackingToken: String!           # plaintext, returned ONCE
  trackingUrl: String!             # e.g., /order/<tenant>/<location>/track/<token>
  shortNumber: Int!
  estimatedReadyAt: DateTime!
}

input ConfirmOnlineOrderInput {
  id: UUID!
  estimatedReadyAt: DateTime       # optional; defaults to max(pickupAt, now + 10min)
}

input RejectOnlineOrderInput {
  id: UUID!
  rejectReason: String!
}
```

### 4.4 Subscription

```graphql
extend type Subscription {
  onlineOrderRequests: OnlineOrderRequestEvent!  # staff scope, location-scoped
}

union OnlineOrderRequestEvent = OnlineOrderRequestCreated | OnlineOrderRequestUpdated
type OnlineOrderRequestCreated  { request: OnlineOrderRequest! }
type OnlineOrderRequestUpdated  { request: OnlineOrderRequest! }
```

Channel `online_orders_<locationId>`. Pubsub helper `onlineOrdersChannelName(locationId)`.

### 4.5 Pure helpers

```ts
// apps/api/src/online-orders/tracking-token.ts
export function generateTrackingToken(): { token: string; tokenHash: string };
export function hashTrackingToken(token: string): string;

// apps/api/src/online-orders/rate-limit.ts
export class TokenBucket {
  constructor(args: { capacity: number; refillPerSec: number });
  consume(key: string, n?: number): boolean;
}

// apps/api/src/online-orders/estimate.ts
export function estimateReadyAt(args: { pickupAt: Date; confirmedAt: Date; minPrepMinutes?: number }): Date;
```

### 4.6 `submitOnlineOrder` flow

1. Rate-limit by IP (consume one token).
2. Validate input via Zod. ConflictError on validation failure.
3. Resolve tenant + location from `(tenantSlug, locationSlug)`. NotFoundError if not found.
4. Verify `pickupAt`:
   - ASAP: ignore input, set `pickupAt = now + 15 minutes`.
   - SCHEDULED: must be ≥ now + 15 min and ≤ now + 7 days.
5. For each item:
   - Fetch MenuItem at the location; verify not archived; verify `availableAtViewerLocation` (location override + manualState).
   - Validate modifier groups (min/max) just like POS `addTicketItem`.
   - Snapshot price using `resolveItemPrice` + `resolveModifierPrice`.
6. Find/create Guest by phone (Guest CRM): if `Guest.findFirst({ tenantId, phone })`, link; else create.
7. In a transaction:
   - Compute `businessDay` and next `shortNumber` for the location.
   - Create Ticket: `orderType=TAKEOUT`, `originChannel=ONLINE`, `customerLabel=customerName`, `guestId=<linked>`, `openedById=<system user>` (see note below).
   - Create TicketItems with snapshots (status=NEW).
   - Generate trackingToken + hash. Insert OnlineOrderRequest.
   - Recompute and persist ticket totals.
8. Audit `online_order.submitted` (with metadata only — do not log token).
9. Publish `OnlineOrderRequestCreated` to `onlineOrdersChannelName(locationId)`.
10. Return `{ trackingToken, trackingUrl, shortNumber, estimatedReadyAt }`.

**System user for `openedById`**: anonymous public submit has no authenticated User. Two options: (a) introduce a per-tenant "system" User row used for online orders; (b) make `Ticket.openedById` nullable. Pick (a) — the tenant gets a `systemUserId Field` on Tenant set at install, populated automatically by a migration; the Foundation-side `User` row has email `system@<tenantSlug>.fnb.local` and `status=DISABLED` so it can never log in. The Foundation-side migration adds:

```prisma
model Tenant {
  ...
  systemUserId String? @unique @map("system_user_id") @db.Uuid
  systemUser   User?   @relation("TenantSystemUser", fields: [systemUserId], references: [id], onDelete: SetNull)
}
```

A small data migration creates a system user per existing tenant and backfills `systemUserId`. New tenants get a system user created in the existing tenant onboarding flow (we don't have one yet — for now, Foundation seed and a small `ensureSystemUser` helper called lazily before the first online order submission).

### 4.7 `confirmOnlineOrder` flow

1. Verify `staff` scope and location ownership.
2. Verify request status PENDING; ConflictError otherwise.
3. In a transaction:
   - Set `confirmStatus=CONFIRMED`, `confirmedAt=now`, `confirmedById=ctx.user.id`.
   - Fire all NEW items on the linked Ticket (set status=FIRED, `firedById=ctx.user.id`, `firedAt=now`).
4. Audit `online_order.confirmed` and `ticket_item.fired` per item.
5. Publish `OnlineOrderRequestUpdated` + `TicketChanged` + `TicketItemChanged` per item.

### 4.8 `rejectOnlineOrder` flow

1. Verify `manager` scope.
2. Verify request status PENDING.
3. In a transaction:
   - Set `confirmStatus=REJECTED`, `rejectedAt=now`, `rejectedById=ctx.user.id`, `rejectReason=input.rejectReason`.
   - Void linked Ticket (status=VOIDED, voidedById, voidReason="Online order rejected"); cascade items to VOIDED.
4. Audit `online_order.rejected` and `ticket.voided`.
5. Publish events.

### 4.9 Audit codes

```
online_order.submitted
online_order.confirmed
online_order.rejected
```

(Plus existing `ticket.*` and `ticket_item.*` codes triggered as side effects.)

---

## 5. UI shape

### 5.1 Public surface — `/(public)/order/[tenantSlug]/[locationSlug]`

Zero-auth, mobile-first, single-column.

- **Header**: tenant name + location name + cart icon (badge with item count).
- **Body**: active menus rendered as collapsible sections; items shown with image, name, short description, price, dietary chips. Tap an item → `<PublicModifierPicker>` dialog (same min/max enforcement as POS picker).
- **Cart drawer**: sticky bottom bar showing item count + subtotal; tap → expanded cart panel with remove/edit per line.
- **Checkout** (`/checkout`): RHF form for `customerName`, `customerPhone` (validated as US-style 10-digit or E.164; see Zod schema), optional `customerEmail`, pickup-kind toggle ("ASAP" / "Schedule"), date+time picker if scheduled, optional `notes`. "Place order — pay at pickup" button.
- **Confirmation** (`/confirmation/[token]`): "Order placed!" success card + tracking URL; QR code for the tracking URL (use a small library `qrcode.react`). "Track this order" button.
- **Tracking** (`/track/[token]`): polled every 5s. Status pill (PENDING → CONFIRMED → READY → SERVED → CLOSED, or REJECTED). Progress bar visualization. Item list with snapshot prices. ETA display.

### 5.2 Staff inbox — `/<location>/online-orders`

Manager-link tab; `staff` scope.

- Top: live count "3 pending · 1 confirmed today". Sound-toggle button (browser audio chime on new request).
- Body: list of cards, sorted by `createdAt asc` for PENDING, then today's confirmed below collapsed.
- Each card: shortNumber, customerName, customerPhone (clickable tel: link), pickup time, item summary, total. Two action buttons: "Accept" (calls `confirmOnlineOrder`) and "Reject" (opens dialog requiring reason — manager scope; UI hides if not manager).
- After confirm: card moves to "Confirmed" group, shows "View ticket" link → POS `/<location>/pos?ticket=<id>`.
- Subscribed to `onlineOrderRequests`.

### 5.3 What's NOT in the UI

- Customer accounts.
- Saved payment methods / payment screen.
- Customer rating / review.
- Delivery address inputs / driver assignment.
- Scheduled-order bulk view.
- Email / SMS confirmation banner.
- Multi-language menus (Foundation's i18n scaffolding remains stubbed).

---

## 6. Testing

### 6.1 Unit
- `generateTrackingToken` produces 32+ char base64url, `hashTrackingToken` deterministic.
- `TokenBucket` rate limit (capacity, refill).
- `estimateReadyAt` for ASAP and SCHEDULED.
- Zod schemas (cross-field rules: SCHEDULED requires pickupAt; pickupAt window).

### 6.2 API integration (Testcontainers)
1. `submitOnlineOrder` happy path: anonymous ctx → ticket created (originChannel ONLINE, items NEW), OnlineOrderRequest with hashed token, Guest auto-linked by phone.
2. `submitOnlineOrder` re-submission with same phone reuses existing Guest.
3. `submitOnlineOrder` with archived item → ConflictError.
4. `submitOnlineOrder` rate-limited per IP after N rapid calls.
5. `confirmOnlineOrder` (staff) fires NEW items → FIRED; status flips.
6. `rejectOnlineOrder` (manager) voids ticket + items.
7. `trackOnlineOrder(token)` returns sanitized tracking projection; rejects unknown tokens with NotFoundError.
8. Cross-tenant + cross-location isolation.
9. Subscription emits on submit + confirm + reject.
10. Audit codes per spec section 4.9.

### 6.3 Web unit
- `<PublicModifierPicker>`: required-1 group disables submit until selection.
- `<PublicCart>`: line removal, total recompute.
- `<OnlineOrderRequestCard>`: action visibility per role (Reject hidden for staff).

### 6.4 Playwright E2E
`online-order-flow.spec.ts`:
1. Visit `/order/acme/mission-st` (no auth required).
2. Browse menu, add Latte (with Size=Medium), add Croissant.
3. Click cart → checkout. Fill name "Bob", phone "555-0100", pickup ASAP.
4. Submit. Confirmation page shows tracking URL.
5. Open `/track/<token>` in same browser. Status PENDING.
6. (Switch to authenticated session via direct GraphQL to a manager) — open `/acme/mission-st/online-orders`, see the request, click Accept.
7. Reload tracking page. Status CONFIRMED.
8. Verify a Ticket exists in `/acme/mission-st/tickets` with originChannel=ONLINE.

---

## 7. Scope guard

In: anonymous public order surface, staff inbox, accept/reject flow, real-time SSE inbox, tracking page (polled), Guest auto-link by phone, single-use tracking tokens, rate-limit per IP, audit log entries.

Out: payment processing, delivery, customer accounts, saved payment methods, scheduled-order calendar view, SMS/email confirmation, ratings/tips, multi-language menus, table-side QR ordering (could layer on later — same model), promotion codes, marketing emails.

---

## 8. Acceptance criteria

1. From a clean browser session (no cookies, no login), navigate to `/order/acme/mission-st` and see the active menu rendered.
2. Add a Latte with required Size=Medium and a Croissant; cart shows correct subtotal.
3. Checkout with name "Bob", phone "555-0100", pickup ASAP. Receive a confirmation page with a tracking URL.
4. Open the tracking URL in a different tab — see the order's status as PENDING with item summary.
5. Sign in as the Acme owner. Navigate to `/acme/mission-st/online-orders`. See the new request as PENDING.
6. Click Accept. Tracking page (within 10s of poll) shows CONFIRMED.
7. Verify a Guest "Bob" with phone "555-0100" exists in `/acme/mission-st/guests` (auto-created on submit).
8. Verify a Ticket exists with `originChannel=ONLINE` and `customerLabel="Bob"`.
9. Close the ticket from POS; tracking page shows CLOSED.
10. CI green: lint, typecheck, unit, integration, web build, all 17 E2E specs (16 prior + 1 new).
