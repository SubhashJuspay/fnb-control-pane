# F&B Control Pane — Online Orders Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** Build Online Orders (pay-on-pickup) — anonymous public order surface, staff inbox, real-time SSE, tracking pages, Guest auto-link by phone.

**Spec:** `docs/superpowers/specs/2026-04-28-fnb-online-orders-design.md`

---

## Task 1 — Schema additions

Append to `packages/db/prisma/schema.prisma`:
- `OnlineOrderRequest` model (per spec §3).
- Two enums: `OnlinePickupKind`, `OnlineOrderConfirmStatus`, `OrderOriginChannel`.
- On `Ticket`: add `originChannel OrderOriginChannel @default(IN_PERSON) @map("origin_channel")` + back-relation `onlineRequest OnlineOrderRequest? @relation("TicketOnlineRequest")`.
- On `Tenant`: add `systemUserId String? @unique @map("system_user_id") @db.Uuid` + `systemUser User? @relation("TenantSystemUser", fields: [systemUserId], references: [id], onDelete: SetNull)`.
- On `User`: add `tenantsAsSystem Tenant[] @relation("TenantSystemUser")`, `onlineOrdersConfirmed OnlineOrderRequest[] @relation("OnlineOrderConfirmedBy")`, `onlineOrdersRejected OnlineOrderRequest[] @relation("OnlineOrderRejectedBy")`.
- On `Location`: add `onlineOrderRequests OnlineOrderRequest[]`.

Migration name `online_orders`. Generate, apply.

Verify all api tests still green after schema regeneration.

Commit: `feat(db): add Online Orders schema (online_order_requests, originChannel, system user)`

## Task 2 — Validation Zod schemas

Files: `packages/validation/src/online-order.ts` + tests + subpath export `./online-order`.

Schemas:
- `submitOnlineOrderSchema`:
  - `tenantSlug` slug pattern, `locationSlug` slug pattern.
  - `customerName` 1-120, `customerPhone` 7-20 (loose; trim spaces/parens), `customerEmail` optional email.
  - `pickupKind` enum.
  - `pickupAt` optional date; required when `pickupKind === 'SCHEDULED'`. Refine: SCHEDULED requires pickupAt ≥ now+15min and ≤ now+7days.
  - `notes` optional 0-500.
  - `items`: array min 1, max 50. Each: `menuItemId` UUID, `quantity` 1-50, `modifiers` array of UUIDs (max 20), `notes` optional.
- `confirmOnlineOrderSchema`: id UUID, optional `estimatedReadyAt` Date.
- `rejectOnlineOrderSchema`: id UUID, `rejectReason` 1-500.
- `trackOnlineOrderSchema`: token min 32.

TDD: tests RED first.

Commit: `feat(validation): add Zod schemas for online order submit/confirm/reject/track`

## Task 3 — Pure helpers: tracking token + estimate

Files: `apps/api/src/online-orders/tracking-token.ts` + test, `apps/api/src/online-orders/estimate.ts` + test.

```ts
// tracking-token.ts
import { createHash, randomBytes } from 'node:crypto';

const PEPPER = process.env.ONLINE_ORDER_TOKEN_PEPPER ?? 'dev-pepper-change-in-prod';

export function generateTrackingToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashTrackingToken(token);
  return { token, tokenHash };
}

export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token + PEPPER).digest('hex');
}
```

```ts
// estimate.ts
export function estimateReadyAt(args: {
  pickupAt: Date;
  confirmedAt: Date;
  minPrepMinutes?: number;
}): Date {
  const minPrep = args.minPrepMinutes ?? 10;
  const earliestFromConfirm = new Date(args.confirmedAt.getTime() + minPrep * 60_000);
  return earliestFromConfirm > args.pickupAt ? earliestFromConfirm : args.pickupAt;
}
```

Tests: RED first; verify `estimateReadyAt` picks the later of pickupAt and confirmedAt+prep.

Commit: `feat(api): add online-order tracking token and ready-time estimate helpers`

## Task 4 — Pure helper: token-bucket rate limiter

File: `apps/api/src/online-orders/rate-limit.ts` + test.

```ts
interface BucketState { tokens: number; lastRefill: number }

export class TokenBucket {
  private capacity: number;
  private refillPerMs: number;
  private state = new Map<string, BucketState>();

  constructor(args: { capacity: number; refillPerSec: number }) {
    this.capacity = args.capacity;
    this.refillPerMs = args.refillPerSec / 1000;
  }

  consume(key: string, n = 1, now = Date.now()): boolean {
    const s = this.state.get(key) ?? { tokens: this.capacity, lastRefill: now };
    const elapsed = now - s.lastRefill;
    const refill = elapsed * this.refillPerMs;
    s.tokens = Math.min(this.capacity, s.tokens + refill);
    s.lastRefill = now;
    if (s.tokens < n) {
      this.state.set(key, s);
      return false;
    }
    s.tokens -= n;
    this.state.set(key, s);
    return true;
  }
}
```

Tests: RED first. Capacity, refill over time, multiple keys independent, concurrent consume races (single-threaded test).

Commit: `feat(api): add token-bucket rate limiter for anonymous online order submits`

## Task 5 — System user helper

File: `apps/api/src/online-orders/system-user.ts` + test.

```ts
import type { PrismaClient } from '@repo/db';

export async function ensureSystemUser(prisma: PrismaClient, tenantId: string, tenantSlug: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { systemUserId: true } });
  if (tenant?.systemUserId) return tenant.systemUserId;
  // Create the system user + link
  const email = `system+${tenantId.slice(0, 8)}@${tenantSlug}.fnb.local`;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'System (Online Orders)', status: 'DISABLED' },
    select: { id: true },
  });
  await prisma.tenant.update({ where: { id: tenantId }, data: { systemUserId: user.id } });
  return user.id;
}
```

Tests: RED first. Creates new system user when missing; reuses on second call; idempotent.

Commit: `feat(api): add ensureSystemUser helper for anonymous ticket attribution`

## Task 6 — `submitOnlineOrder` + tracking + public lookup queries

Files:
- `apps/api/src/schema/online-order-request.ts` — `OnlineOrderRequest` prismaObject + `OnlineOrderTracking` object type + queries `onlineOrderRequests`, `onlineOrderRequest(id)` (staff scope) and `trackOnlineOrder(token)` (anonymous).
- `apps/api/src/schema/public-location.ts` — anonymous `publicLocationBySlug(tenantSlug, locationSlug)` query returning sanitized `PublicLocation` with nested `activeMenus(at)`. Reuses Menu sub-project resolvers but re-resolves tenant+location from args (no auth context needed).
- `apps/api/src/schema/mutations/online-orders/inputs.ts`, `index.ts`, `submit-online-order.ts`, `confirm-online-order.ts`, `reject-online-order.ts` + tests.
- `apps/api/src/pubsub.ts` — add `onlineOrdersChannelName(locationId)` next to existing channel helpers.
- Modify `apps/api/src/schema/index.ts` to register new modules.

`submitOnlineOrder` flow per spec section 4.6:
1. Rate-limit via shared `TokenBucket` instance (10/min capacity, refill 0.166/sec); key = client IP from `request.headers['x-forwarded-for']` or fallback. ConflictError "Too many submissions" if denied.
2. Zod validate.
3. Look up tenant by slug, location by (tenantId, slug).
4. ASAP override: set `pickupAt = now + 15 min`. SCHEDULED: validate input.
5. For each item: load MenuItem (must belong to tenant), check not archived. Load LocationItem override; compute effective price via `resolveItemPrice`. Validate modifiers belong to attached groups; min/max enforced.
6. Find/create Guest by `(tenantId, phone)` match (case-insensitive normalize phone — strip spaces/parens/dashes).
7. `ensureSystemUser` for openedById.
8. In a transaction:
   - `nextShortNumber` for (locationId, businessDay).
   - Create Ticket (`orderType=TAKEOUT`, `originChannel=ONLINE`, `customerLabel=customerName`, `guestId`, `openedById=systemUserId`).
   - Insert TicketItems with snapshots, status NEW.
   - Generate token + hash; insert OnlineOrderRequest.
   - Recompute totals via `computeTicketTotalsCents` (live tax 0 for now; final tax at close — same as POS pattern).
9. Audit `online_order.submitted` (metadata: `{ requestId, ticketId, itemCount }` — never log token).
10. Publish `OnlineOrderRequestCreated` to `onlineOrdersChannelName(locationId)`.
11. Return `{ trackingToken, trackingUrl: '/order/<tenantSlug>/<locationSlug>/track/' + trackingToken, shortNumber, estimatedReadyAt }`.

`confirmOnlineOrder` (staff): per spec section 4.7. Status PENDING required. Fire all NEW items in a transaction. Audit `online_order.confirmed` + per-item `ticket_item.fired`. Publish `OnlineOrderRequestUpdated`, `TicketChanged`, `TicketItemChanged`.

`rejectOnlineOrder` (manager): per spec section 4.8. Status PENDING required. Void ticket + cascade items. Audit `online_order.rejected` + `ticket.voided`.

`trackOnlineOrder(token)` (anonymous): hash the token, look up by `trackingTokenHash`, return sanitized projection with computed fields (`itemSummary`, `isReady`, `estimatedReadyAt`).

`onlineOrderRequests(filter)` and `onlineOrderRequest(id)` (staff scope): location-scoped via `ctx.auth.location.id`.

`publicLocationBySlug` (anonymous): resolves tenant+location from args; returns `PublicLocation` with `activeMenus(at)` field that delegates to existing `resolveActiveMenus` logic from Menu sub-project. Critical: the public projection MUST sanitize fields — no internal user data, no tenant-wide pricing notes, no archived items.

Tests for each mutation/query: pure-function extraction; mocked Prisma + spy on pubsub.

Commit: `feat(api): add online-order submit / confirm / reject / track + public menu query`

## Task 7 — `onlineOrderRequests` SSE subscription

File: `apps/api/src/schema/subscriptions/online-order-requests.ts`. Mirrors `ticket-updates.ts` pattern. Two payloads: `OnlineOrderRequestCreated`, `OnlineOrderRequestUpdated`. Channel `onlineOrdersChannelName(ctx.auth.location.id)`. Hydrate via Prisma.

Register in `apps/api/src/schema/subscriptions/index.ts`.

Tests: pure-function-extracted iterator; subscription end-to-end via Testcontainers (publish + assert next yield).

Commit: `feat(api): add onlineOrderRequests SSE subscription`

## Task 8 — Integration tests

File: `apps/api/src/test/integration/online-orders.test.ts`. Use `setupTestDb` + extend `truncateAll` to include `online_order_requests` (in correct FK order: online_order_requests before tickets).

Seed helper `seedOnlineOrderFixtures`: tenant + location + tax category + Latte item with required Size group + manager + staff users.

Scenarios per spec section 6.2 (10 scenarios). Use `clearCache()` between scenarios.

Commit: `test(api): add Online Orders integration suite`

## Task 9 — Public surface (browse + checkout + confirmation + tracking)

Files:
- `apps/web/lib/graphql/operations/online-orders.graphql` — `PublicLocationBySlug`, `TrackOnlineOrder`, `SubmitOnlineOrder`, plus staff-side queries/mutations and the subscription.
- Refresh static SDL, run codegen.
- `apps/web/app/(public)/layout.tsx` — minimal shell, no auth, no app navigation. Lightweight providers.
- `apps/web/app/(public)/order/[tenantSlug]/[locationSlug]/page.tsx` — server component fetches `publicLocationBySlug` and renders `<OrderBrowse>`.
- `apps/web/app/(public)/order/[tenantSlug]/[locationSlug]/checkout/page.tsx`.
- `apps/web/app/(public)/order/[tenantSlug]/[locationSlug]/confirmation/[token]/page.tsx`.
- `apps/web/app/(public)/order/[tenantSlug]/[locationSlug]/track/[token]/page.tsx`.
- `apps/web/components/order/`:
  - `order-shell.tsx` — header (tenant + location name, cart icon).
  - `public-menu-list.tsx` — collapsible sections.
  - `public-menu-item-tile.tsx`.
  - `public-modifier-picker.tsx` — dialog enforcing min/max (mirror POS modifier picker but consumes `PublicModifierGroup` shape).
  - `cart-drawer.tsx` — sticky bottom bar + expanded panel; cart state in Zustand or React context kept in sessionStorage so a refresh preserves it.
  - `cart-state.ts` — small store. Each cart item: { menuItemId, name, quantity, modifierIds, modifierSnapshots, unitPriceCents, modifiersTotalCents, notes }.
  - `checkout-form.tsx` — RHF + zodResolver with `submitOnlineOrderSchema`. Pickup-kind toggle. Phone formatted nicely.
  - `confirmation-card.tsx` — success state, copy-tracking-URL button, QR code via `qrcode.react`.
  - `tracking-page.tsx` — polled `useQuery` with `requestPolicy: 'network-only'` and a manual setInterval refetch every 5s. Status pill + progress bar.

Add `qrcode.react` and `zustand` (or use React context — simpler) to `apps/web` deps. Pick one and stick with it.

`(public)` layout uses a SEPARATE urql client (not the existing tenant-scoped one) — no `x-tenant-slug` headers. It uses the same `/api/graphql` proxy, but anonymous.

Commit: `feat(web): add public order surface (browse, checkout, confirmation, tracking)`

## Task 10 — Staff inbox + nav integration

Files:
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/online-orders/{layout,page}.tsx` — staff scope.
- `apps/web/components/online-orders/`:
  - `online-orders-inbox.tsx` — main list with `useSubscription(OnlineOrderRequestsDocument)`.
  - `online-order-request-card.tsx` — single card; "Accept" button (always visible to staff); "Reject" button (visible only to manager+).
  - `reject-online-order-dialog.tsx` — RHF + reason input.
- Update `apps/web/components/shell/sidebar.tsx` to add an "Online Orders" link (location-scoped, staff visible). Show a small badge with pending count via a small additional query.

Audio chime: optional toggle in the inbox header (browser audio API; default off). Stored in `localStorage`.

Commit: `feat(web): add online-orders staff inbox with real-time SSE and accept/reject flow`

## Task 11 — Playwright E2E

File: `apps/web/tests/e2e/online-order-flow.spec.ts`.

`createOnlineOrderFixtures` helper in `seed.ts` (or just reuse `createCatalogFixtures`).

Spec flow:
1. `beforeEach`: resetTestData + createCatalogFixtures.
2. Visit `/order/acme/mission-st` (anonymous). Verify menu renders and Latte tile is visible.
3. Click Latte → modifier picker opens. Pick Medium. Submit.
4. Click cart icon → cart panel shows Latte.
5. Click Checkout. Fill name "Bob", phone "555-0100", pickup ASAP.
6. Submit. Confirmation page renders with tracking URL.
7. Visit the tracking URL (extract from page). Status PENDING.
8. Sign in as `owner@acme.test` (in a new browser context, since the public flow used no cookie; just `page.goto('/sign-in')`).
9. Navigate to `/acme/mission-st/online-orders`. Pending request visible.
10. Click "Accept". Order confirmed.
11. Verify a Guest "Bob" with phone "555-0100" exists at `/acme/mission-st/guests`.
12. Verify a Ticket exists at `/acme/mission-st/tickets` with status OPEN, originChannel ONLINE, customer "Bob".

Add `data-testid` attributes to source components as needed for stability.

Commit: `test(web): add E2E spec for online-order flow`

---

## Self-review

- Spec sections all mapped.
- Pure helpers (3, 4, 5) have full TDD code.
- Other tasks are bullet-point per established pattern.
- Names consistent: `generateTrackingToken`, `hashTrackingToken`, `TokenBucket`, `ensureSystemUser`, `estimateReadyAt`, `onlineOrdersChannelName`, `submitOnlineOrder`, `confirmOnlineOrder`, `rejectOnlineOrder`, `trackOnlineOrder`, `publicLocationBySlug`.
