# F&B Control Pane

### A self-hostable operating system for restaurants

---

## In one sentence

A multi-tenant, production-ready web platform that runs the entire operational surface of a restaurant — menus, in-person ordering, kitchen, floor, reservations, staff scheduling, online orders, and analytics — on a single Docker stack you own.

---

## Why this exists

Restaurants today choose between three bad options:

1. **Stitch together five SaaS tools** — POS, reservations, scheduling, online ordering, analytics — that don't talk to each other and bill four-figures-a-month per location.
2. **Buy one giant proprietary system** (Toast, Clover, Square for Restaurants) where the prices climb at every renewal and the data is locked in.
3. **Run nothing** and stay invisible to the customer.

F&B Control Pane is the fourth option: **one cohesive platform, self-hostable, MIT-style permissive, with the same surface area as the big platforms** — minus the lock-in. Every restaurant from a coffee cart to a regional chain runs on the same codebase.

---

## Who it serves

- **Single-location indie restaurants** — a coffee shop, a bistro, a food truck.
- **Restaurant groups & chains** — multiple locations under one tenant, with a master catalog and per-location overrides.
- **Food halls & ghost kitchens** — same tenancy model, multiple "locations" inside one physical address.

The same product fits all three because **multi-tenancy and chain support are baked in from the data model up**.

---

## What it does — feature by feature

### 1. Foundation — the operational backbone

The plumbing every other capability sits on:

- **Multi-tenant architecture** — Tenant → Location → User-with-role hierarchy. A chain operator manages 20 locations under one tenant; a single-location indie just has one location. Same schema, no special cases.
- **Role-based access control** — five built-in roles (Owner, Admin, Manager, Staff, Viewer) with sensible defaults. Permissions are enforced at the GraphQL request context — there is no path to data without a verified `(tenant, location, role)` triple.
- **Self-serve onboarding** — owners invite teammates by email; teammates accept with a single-use token, set their password, sign in. No support ticket required.
- **Audit log** — every sensitive write (role change, menu edit, void, discount, reservation cancel) is recorded with actor, action, resource, and metadata. Surfaces in the admin UI; queryable by date.
- **Real-time everywhere** — the platform uses Server-Sent Events backed by Postgres LISTEN/NOTIFY, so KDS, floor, and online-orders inboxes update in under a second across every connected device.
- **Self-hostable Docker stack** — one `docker compose up` brings up Postgres, the API, the web app, and a development mail catcher. Production overlay adds nginx with TLS, externalized Postgres, and resource limits.
- **MFA, session management, audit trail** — Auth.js v5 handles the security primitives. Sessions live in your Postgres, not a third-party SaaS.

### 2. Menu & Catalog — Clover-style master catalog

Restaurants don't sell items, they sell **catalogs**. The Menu sub-project ships a tenant-wide master catalog with surgical per-location override:

- **Items, modifiers, modifier groups** with min/max selection rules. Required-1 ("pick a size") and optional-up-to-N ("up to 3 toppings") are first-class, exactly like Toast and Clover.
- **Categories** for navigation; **dietary tags** (vegetarian, vegan, gluten-free, etc.) and **allergen tags** (contains nuts, dairy, etc.) for customer-facing display and kitchen awareness.
- **Tax categories** (Food, Non-alcohol Beverage, Alcohol, Retail) with **time-bounded location-scoped tax rates** — when the rate changes, historical orders still compute correctly.
- **Per-location menus** with **weekly schedules** — Breakfast Mon–Fri 6am–11am, Brunch Sat–Sun 8am–2pm, Happy Hour weekdays 4pm–7pm. The system computes which menus are live right now.
- **Section-level price overrides** — same Latte appears on the All-Day menu at $4.50 and on Happy Hour at $3.00. No duplication of the item.
- **Per-location overrides** — different price, hide an item, or mark it 86'd ("we ran out") with a single tap from the line. The 86 toggle is the one staff-scope mutation in the catalog because line cooks need it instantly.
- **Image-aware tiles** — item URLs render as 64×64 thumbnails throughout admin and POS.
- **Drag-and-drop everywhere** — reorder sections, items, modifiers, categories. No "click up arrow 12 times".

**Why this matters:** restaurant menu data has a long tail of complexity (modifier groups within modifier groups, time-of-day pricing, location quirks, regulated tax categories) and getting any of it wrong corrupts every downstream system. This is the layer that makes everything else honest.

### 3. POS / Order Management — the revenue surface

Touch-first point of sale plus a kitchen display, payment-agnostic:

- **Touch tile-grid POS** designed for tablets but works on desktop. Two-column layout: menu tile grid on the left, active ticket panel on the right.
- **Counter + open-tab service mode** — works for fast-casual (coffee shops, food trucks) and hospitality (bars, cafes with high-tops). Tickets get optional customer labels ("Sarah", "the gentleman in blue").
- **Per-line state machine** — `NEW → FIRED → READY → SERVED → VOIDED`. The KDS bumps items individually as they finish, so servers see exactly which lines are out and which are still cooking.
- **Bulk fire** — "Fire all" sends every NEW item to the kitchen at once, the moment the customer is ready.
- **Kitchen Display System (KDS)** — full-screen tablet view with course-grouped cards, per-item bump buttons, and time-since-fire color thresholds (green < 5 min, yellow 5–10 min, red > 10 min). Auto-disappears tickets when fully served.
- **Live discount and void flows** — line-level and ticket-level discounts (flat or percentage), with reason codes and manager-scope authorization. Void requires a reason and is staff-scope (line cooks need to be able to do it instantly).
- **Snapshot pricing** — when an item is added to a ticket, the price is frozen to the moment of capture. Mid-shift price changes never rewrite ticket history. This is critical for audit-correct accounting.
- **Daily-resetting ticket numbers** — `#42` is what staff and customers say to each other; it resets each business day at the location's configurable cutoff (a Friday-night order at 1am Saturday still gets a Friday number).
- **Tax calculation** — per-line tax against the location's time-bounded rate, snapshotted at close. Survives rate changes.
- **Closure with note** — payment processing is a separate phase; for now closure records a free-form note ("paid cash $25 + tip"), which becomes the seam for Stripe Terminal or any PSP later.
- **Reopen** — accidental close? Manager can reopen a ticket; closeNote clears, audit trail records both events.
- **Ticket history with filters** — date range, status, server. Manager-scope.
- **Real-time POS↔KDS sync** — bumping an item on KDS reflects in POS within ~100ms. No refresh, no polling.

**Why this matters:** POS is where money happens. Every state transition is gated by the pure state-machine helpers; every mutation writes an audit row; every ticket number is unique within a business day. Production use of this code is realistic from day one.

### 4. Floor / Tables / Reservations — front-of-house

Visual floor plan, table state, reservations book, and walk-in waitlist:

- **Floor plan editor** — drag tables onto a canvas, set position, dimensions, rotation, shape (rect or circle), capacity, section. Snap-to-grid. Real-time autosave.
- **Sections** — Patio, Bar, Main, Private Dining. Tables belong to one section.
- **Live floor view** — a SVG floor map tinted by table state (Available / Occupied / Reserved / Cleaning). Click a table for context-aware actions.
- **Derived table state** — Available unless: there's an open ticket on it (Occupied), a reservation is imminent (Reserved), or someone marked it Cleaning. The derivation is one pure function so every consumer sees the same thing.
- **Server assignments** — managers assign servers to tables; staff can filter to "my tables" view.
- **Reservations book** — calendar of upcoming reservations with statuses (Pending → Confirmed → Seated → Completed). One-click confirm, seat (opens a ticket bound to the table), cancel, mark no-show.
- **Walk-in waitlist** — guest with party size, no specific time. Time-since-added auto-updates so the host knows how long someone's been waiting.
- **Seat-flow integration with POS** — when a reservation is seated, the system opens a Ticket bound to the assigned table. When the ticket closes, the reservation auto-completes. No double bookkeeping.
- **Real-time floor updates** — when a server fires a ticket on a table, every other staff member's floor view updates within ~1 second.

**Why this matters:** the floor is where servers actually work. The derived-state model means there's no "is this table really free?" ambiguity — the answer comes from one source of truth.

### 5. Staff & Scheduling — payroll-adjacent operations

Job roles, employment profiles, shift schedules, and time clock — minus the actual payroll:

- **Job roles** — Server, Cook, Bar, Host, etc. Tenant-scoped; each shift carries a job role with a color so the schedule grid is glanceable.
- **Employment profiles** per (user, location) — employment type (full-time, part-time, contractor), hourly rate, hire date, optional termination date, notes. Admin-scope (sensitive data).
- **Availability windows** — staff set their own weekly availability ("Mon–Wed 8am–4pm"). Manager can override.
- **Shift schedule editor** — week-grid view (rows = users, columns = days), shifts shown as colored chips. Click empty cell to add. Click chip to edit. Status flow: Draft → Published → Cancelled.
- **Bulk publish** — click "Publish week" to flip every Draft shift to Published at once.
- **Duplicate week** — copy this week's published shifts to next week (as Draft for review).
- **Overlap detection** — adding two shifts that overlap for the same user is blocked at the API.
- **My schedule** — read-only view for staff: upcoming Published shifts grouped by day.
- **Time clock kiosk** — large touch-friendly Punch In / Punch Out / Start Break / End Break button. Auto-binds to the next scheduled shift if one is starting within 60 minutes.
- **Manager edits** — managers can correct a forgotten clock-out; the entry is flagged `manualEdit=true` with a required reason.
- **Time entries report** — date-range filter, user filter, net hours (gross minus breaks), manual-edit badge.
- **Real-time** — schedule changes and time-clock events broadcast to every connected manager dashboard.

**Why this matters:** scheduling drives labor cost, and labor is the second-largest restaurant expense after food. Getting shifts published reliably and tracked accurately at the time-clock end is the input to any future payroll integration (Gusto, ADP, etc.) — the data shape is already correct.

### 6. Analytics & Guest CRM — the loop closer

Live aggregation queries over POS tickets, plus a Guest CRM that ties orders to people:

- **Dashboard** — landing page for managers with KPIs: today's net sales, ticket count, average ticket, unique guests. Revenue sparkline (last 7 days). Top 5 items today.
- **Insights tabs** — date-range scoped reports across:
  - **Sales** — ticket counts, gross/discount/tax/net breakdown, average ticket, unique guests.
  - **Items** — top dishes by quantity / revenue / ticket count. Sortable.
  - **Hours** — hour-of-day mix to see when sales peak.
  - **Servers** — per-server leaderboard with ticket count, items served, revenue, void rate.
  - **Guests** — new vs returning cohort, repeat rate.
- **Guest CRM** — Guest profile per tenant: name, phone, optional email, notes. Auto-link to tickets and reservations.
- **Visit history per guest** — visit count, total spent, average ticket, first visit, recent tickets, upcoming reservation.
- **Picker integrations** — link a guest to a ticket from POS (one-tap typeahead), link to a reservation in the New Reservation dialog.
- **Auto-link by phone** — when an online order comes in with a known phone number, the matching Guest is found and linked automatically. Unknown numbers create a new Guest.
- **Currency-aware everywhere** — every dollar figure renders in the location's configured currency (USD, EUR, etc.) with proper locale formatting.
- **TTL-cached** — heavy aggregations are cached at the API for 60 seconds, so a manager flipping between tabs doesn't hammer the database.

**Why this matters:** the gap between "we collected the data" and "we know what to do with it" is where most operators stall. The dashboard exists for the morning standup; insights tabs exist for the weekly review; guest CRM exists to convert first-time guests into regulars.

### 7. Online Orders — pickup, no platform fees

A public, no-account customer ordering surface with staff-side acceptance flow:

- **Public web menu** at `/order/<tenant>/<location>` — anyone can browse the active menu, no signup, no app install. Mobile-first.
- **Cart with modifier rules enforced** — same min/max validation as POS, so the kitchen never receives an under-specified order.
- **Checkout** — name, phone, optional email, ASAP-or-scheduled pickup time. No payment field — pay when you pick up. (Payment processing is a deliberate carve-out for the next phase.)
- **Tracking page** — every order gets a single-use tracking token; the customer sees status updates (Received → Confirmed → Preparing → Ready) without an account.
- **Staff inbox** — `/online-orders` real-time inbox. New requests appear within seconds via SSE.
- **Manual confirmation** — staff click "Accept" to fire the order to the kitchen, or "Reject" (with a reason) to refuse it. Manager-scope on reject because real money is at stake.
- **Linked Guest** — submitting with a known phone number auto-links to the guest CRM. Repeat customers' lifetime value accumulates without any extra work.
- **Same Ticket model under the hood** — online orders are regular Tickets with `originChannel: ONLINE`. They flow through the same KDS and POS surfaces; analytics include them automatically (with the ability to filter in/out).
- **Rate-limited public endpoint** — token-bucket rate limit per IP (10/min) protects against abuse.
- **Hashed tracking tokens** — the token is sent to the customer once and stored as SHA-256 + pepper in the database. Lost link = lost access; no replay attacks.

**Why this matters:** every restaurant needs an online ordering channel and most are paying 15–30% commissions to a third party. This puts the channel under their own roof, and integrates with the rest of the operation rather than living as a separate spreadsheet.

---

## Architectural highlights

- **Single TypeScript monorepo** — `apps/web` (Next.js 15 App Router), `apps/api` (GraphQL Yoga + Pothos on Fastify), shared `packages/` for db (Prisma), validation (Zod), UI (shadcn + Tailwind), config, types.
- **Strict TypeScript, no `any`** — the schema is the source of truth and types flow from Prisma → Pothos → GraphQL → codegen → React hooks.
- **Postgres 16** — UUIDs everywhere, audit trail, soft deletes via `archivedAt`, money in integer cents.
- **GraphQL Yoga + Pothos with code-first schema, Relay-style pagination, scope-based auth** — every resolver declares its required scope; missing scope is a bug caught by tests.
- **Server-Sent Events for real-time** — works through every reverse proxy without WebSocket-specific config; Postgres LISTEN/NOTIFY for cross-instance fan-out.
- **shadcn/ui + Tailwind + Radix** — we own the component code; aesthetic ceiling is high.
- **Comprehensive test pyramid** — 142 validation tests, 892 API unit + integration tests (Testcontainers ephemeral Postgres), 71 web unit tests, **17 Playwright E2E specs covering the golden flows of every sub-project**.
- **CI/CD via GitHub Actions** — lint, typecheck, unit, integration, build, E2E, push images to GHCR on main.

---

## What's intentionally NOT in v1

Honest deferrals — every one of these is a feature the platform is *built to extend into* but doesn't ship in this release:

- **Payment processing** — the seam is the POS `closeTicket` resolver. Stripe Terminal, Square, Adyen, or any PSP plugs in here.
- **Customer-facing reservation booking page** — staff-side reservation management is in; a public booking widget is the next pull on this thread.
- **Inventory / recipe / cost-of-goods tracking** — the catalog has the items; tying recipes to ingredients and decrementing on sale is the inventory phase.
- **Payroll runs** — shift and time-entry data is the input. Gusto / ADP integration plugs in here.
- **SMS / email confirmations** — transactional notifications layer; templates and delivery infra ride on top of the existing event log.
- **Loyalty programs, marketing automation, ratings** — Guest CRM is the foundation; these are extensions.
- **Mobile native apps** — the GraphQL API is mobile-ready; a React Native client is a future surface, not a rewrite.
- **Multi-floor, fine-dining course-fire pacing, table-side QR ordering** — all designed in (the data model has the hooks); UI extensions, not data-model rewrites.

---

## Demo

Stack runs on `docker compose up`. Demo seed produces 10 logins across two tenants — see [`DEMO-CREDENTIALS.md`](./DEMO-CREDENTIALS.md).

Key URLs once the stack is up:

| URL | What you'll see |
|---|---|
| http://localhost:3000 | Sign-in page |
| http://localhost:3000/acme/mission-st/dashboard | Manager dashboard with KPIs and sparkline |
| http://localhost:3000/acme/mission-st/pos | Touch-first POS workspace |
| http://localhost:3000/acme/mission-st/kds | Kitchen Display System |
| http://localhost:3000/acme/mission-st/floor | Live floor map |
| http://localhost:3000/acme/mission-st/reservations | Today's reservations + waitlist |
| http://localhost:3000/acme/mission-st/schedule | Week-grid shift editor |
| http://localhost:3000/acme/mission-st/insights | Sales / items / hours / servers / cohort tabs |
| http://localhost:3000/acme/mission-st/guests | Guest CRM list |
| http://localhost:3000/acme/mission-st/online-orders | Pending online order inbox |
| http://localhost:3000/order/acme/mission-st | **Public** customer order surface (no auth) |
| http://localhost:3000/admin/staff (acme) | Staff roster + employment profiles |

Default password for every demo account: **`Password123!`**

---

## Numbers, for the curious

- **127 commits** across 7 sub-projects, each with brainstorm → spec → plan → wave-by-wave subagent execution.
- **1,122 passing tests** across all suites.
- **17/17 Playwright E2E specs** green on every commit to main.
- **0 dependencies on external SaaS** for the core platform. Sentry / OpenTelemetry are opt-in. Email goes through whatever SMTP you supply.

---

## In closing

Most restaurant software is built **for the people who sell it**, not the people who use it. F&B Control Pane is built around the operator's day:

- Open the floor view in the morning to see who's where.
- Open the POS during service and never feel the seams between front-of-house and the kitchen.
- Open the dashboard at the end of the night and know what mattered.
- Tomorrow morning, look at the schedule, publish next week, and notice that two of your repeat guests have reservations.

That's the loop. The platform is what makes it possible to run that loop without ten browser tabs and a spreadsheet.
